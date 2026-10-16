import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import {
    createFormHelpers,
    safeRemoveFile
} from './form-helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// No dotenv.config() here on purpose. The desktop app injects
// PLAYWRIGHT_BROWSERS_PATH / HEADLESS / PORT into this process from the Electron
// main process, and the previous `dotenv.config({ override: true })` silently
// clobbered them with values from a .env file sitting next to the installer.
// Env loading is the server's job (automation-server/lib/config.mjs).

// Portal selectors drift without warning. When a step times out, keep a
// screenshot plus the form controls actually on the page so the broken selector
// can be fixed from evidence instead of guesswork. Best-effort: never masks the
// original error.
async function saveFailureSnapshot(page, jobId) {
    if (!page || page.isClosed()) return;
    try {
        const dir = process.env.AUTOMATION_LOG_DIR
            ? path.join(process.env.AUTOMATION_LOG_DIR, 'failures')
            : path.join(__dirname, '..', 'logs', 'failures');
        fs.mkdirSync(dir, { recursive: true });
        const base = path.join(dir, String(jobId || Date.now()));

        await page.screenshot({ path: `${base}.png`, fullPage: true });
        const controls = await page.evaluate(() =>
            Array.from(document.querySelectorAll('input, select, textarea, button, [role="combobox"]')).map((el) => ({
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                name: el.getAttribute('name'),
                type: el.getAttribute('type'),
                role: el.getAttribute('role'),
                label: el.labels?.[0]?.innerText?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder'),
                text: el.tagName === 'BUTTON' ? el.innerText.trim().slice(0, 60) : undefined,
            }))
        );
        fs.writeFileSync(`${base}.json`, JSON.stringify({ url: page.url(), controls }, null, 2));
        console.log(`   🧾 Failure snapshot saved: ${base}.png / .json`);
    } catch (snapshotError) {
        console.log(`   ⚠️ Could not save failure snapshot: ${snapshotError.message}`);
    }
}

// STATE MANAGEMENT: Job map for progress tracking
const activeJobs = new Map();
let latestJobId = null;

// Automation steps for progress tracking
const AUTOMATION_STEPS = [
    { id: 'browser_init', name: 'Initializing browser', progress: 5 },
    { id: 'navigation', name: 'Navigating to eTA portal', progress: 10 },
    { id: 'selection', name: 'Selecting application type', progress: 15 },
    { id: 'agreement', name: 'Accepting terms', progress: 20 },
    { id: 'personal_info', name: 'Filling personal information', progress: 30 },
    { id: 'passport_info', name: 'Processing passport details', progress: 40 },
    { id: 'arrival_info', name: 'Filling arrival details', progress: 50 },
    { id: 'departure_info', name: 'Filling departure details', progress: 60 },
    { id: 'accommodation', name: 'Processing accommodation', progress: 70 },
    { id: 'background', name: 'Filling background info', progress: 80 },
    { id: 'customs', name: 'Processing customs declaration', progress: 85 },
    { id: 'uploads', name: 'Uploading documents', progress: 90 },
    { id: 'confirmation', name: 'Confirming submission', progress: 95 },
    { id: 'payment', name: 'Selecting payment type', progress: 98 },
    { id: 'complete', name: 'Automation complete', progress: 100 }
];

function updateJobProgress(jobId, stepId, message = null) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    const step = AUTOMATION_STEPS.find(s => s.id === stepId);
    if (step) {
        job.currentStep = step.name;
        job.progress = step.progress;
        if (message) job.message = message;
        job.updatedAt = new Date().toISOString();
    }
}

function addJobLog(jobId, level, stepId, message) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    job.logs.push({
        timestamp: new Date().toISOString(),
        level,
        step: stepId,
        message
    });
}

// Captured before any shadowing so run-scoped loggers can still reach the real
// terminal/file output.
const realConsole = console;

// Builds a console-shaped object that tees into one job's log array.
//
// This replaces a global monkey-patch that reassigned console.log/warn/error
// process-wide and never restored them. That was survivable when a dedicated
// worker process ran a single job at a time, but this process now hosts every
// automation concurrently: after one eTA Kenya run, every later automation's
// output would have been permanently captured into a dead job's log array -
// both a cross-run data leak and an unbounded memory leak.
function createRunConsole(jobId) {
    const tee = (level, realFn) => (...args) => {
        realFn(...args);
        const message = args
            .map(a => (typeof a === 'object' ? safeStringify(a) : String(a)))
            .join(' ');
        addJobLog(jobId, level, 'running', message);
    };

    return {
        log: tee('info', realConsole.log.bind(realConsole)),
        warn: tee('warn', realConsole.warn.bind(realConsole)),
        error: tee('error', realConsole.error.bind(realConsole)),
        info: tee('info', realConsole.info?.bind(realConsole) ?? realConsole.log.bind(realConsole)),
        debug: realConsole.debug.bind(realConsole),
    };
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

// Export functions for querying job status
export function getJobProgress(jobId) {
    const job = activeJobs.get(jobId);
    if (!job) return null;
    return {
        id: job.id,
        isRunning: job.isRunning,
        progress: job.progress,
        currentStep: job.currentStep,
        message: job.message,
        logs: job.logs,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        error: job.error
    };
}

export function getLatestJobId() {
    return latestJobId;
}

export function getAllJobs() {
    return Array.from(activeJobs.values());
}

export async function stopJob(jobId) {
    const job = activeJobs.get(jobId);
    if (!job) return false;
    job.stopRequested = true;
    job.isRunning = false;
    job.message = 'Automation stopped by user';
    if (job.browser) {
        try { await job.browser.close(); } catch (_) {}
        job.browser = null;
    }
    return true;
}

// The old module-level downloadFile() was removed: it called axios() and
// os.tmpdir() without importing either, so it would have thrown on first use.
// It was also dead - runEtaKenyaAutomation destructures a working downloadFile
// out of createFormHelpers(page) instead.

export async function handleDocumentUpload(page, formSelector, filePath, label = 'Document') {
    console.log(`   📂 [DOC] Processing ${label} document upload...`);

    try {
        // Wait for the form to be visible
        await page.locator(formSelector).waitFor({ state: 'visible', timeout: 10000 });

        // Find the file input INSIDE the form
        // The input is typically: <input type="file" ...>
        const fileInput = page.locator(`${formSelector} input[type="file"]`).first();

        // Wait for the input to be attached to the DOM
        await fileInput.waitFor({ state: 'attached', timeout: 10000 });

        console.log(`   ↑↑ Uploading local ${label} document: ${filePath}`);

        // Upload the file
        await fileInput.setInputFiles(filePath);

        // Wait a moment for the upload to process
        await page.waitForTimeout(2000);

        console.log(`   ✅ ${label} uploaded successfully`);

    } catch (error) {
        console.error(`   ❌ Error processing ${label} document:`, error.message);
        throw error;
    }
}

/**
 * Runs the eTA Kenya application end to end in a real browser.
 *
 * @param {{ formData: Record<string, any> }} requestData
 * @param {string|null} jobId - Job id to report progress under. The server
 *   supplies this so the id the UI polls matches the id progress is stored under.
 * @param {{ onComplete?: (result: { taskId: any, screenshotBase64: string }) => Promise<void> }} [hooks]
 *   onComplete - called with the outcome screenshot once the portal submission
 *   succeeds, so the caller can persist it. Injected rather than done inline so
 *   this module needs no database credentials of its own.
 * @returns {Promise<{ success: boolean, taskId?: any, screenshot?: string, cancelled?: boolean, error?: string }>}
 */
export async function runEtaKenyaAutomation(requestData, jobId = null, hooks = {}) {
    const { onComplete } = hooks;

    // Create or use existing job ID
    const currentJobId = jobId || Date.now().toString() + Math.random().toString(36).substring(7);
    latestJobId = currentJobId;

    // Initialize job state
    const job = {
        id: currentJobId,
        isRunning: true,
        progress: 0,
        currentStep: 'Initializing',
        message: 'Starting automation',
        logs: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        browser: null,
        stopRequested: false
    };
    activeJobs.set(currentJobId, job);

    addJobLog(currentJobId, 'info', 'start', 'eTA Kenya automation started');

    // Shadow the global `console` for the rest of this function only, so the
    // several hundred console.log calls in the automation body below are tee'd
    // into this job's logs without any of them needing to change. Because this
    // is a function-scoped `const` rather than a reassignment of the global,
    // there is nothing to restore and other concurrent runs are unaffected.
    const console = createRunConsole(currentJobId);

    console.log('🚀 Starting eTA Kenya Automation...');

    // Track downloaded files for cleanup
    const downloadedPaths = [];

    updateJobProgress(currentJobId, 'browser_init', 'Launching browser...');

    let browser = null;
    let page = null;

    try {
        // Headful by default: this is a user-visible desktop app and the eTA
        // portal's file-upload steps are more reliable with a real window. The
        // previous logic (`HEADLESS !== 'false'`) meant headless unless HEADLESS
        // was explicitly "false", which is the opposite of what the desktop
        // shell injects. A visible-but-unfocused window position keeps the run
        // observable without stealing focus from the app window.
        const isHeadless = process.env.HEADLESS?.trim().toLowerCase() === 'true';
        browser = await chromium.launch({
            headless: isHeadless,
            slowMo: Number(process.env.SLOW_MO) || 0,
            args: [
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                // A normal, visible, maximized window. It used to be parked
                // off-screen (-32000,-32000) to avoid stealing focus, but then
                // staff saw it in the taskbar and could neither bring it up nor
                // maximize it - and a run you can't watch looks like it never
                // started. Visible also keeps the portal's widgets happy (they
                // behave differently when the page believes it is hidden).
                '--start-maximized'
            ]
        });
        // Store browser reference on job so stopJob() can close it
        const jobRef = activeJobs.get(currentJobId);
        if (jobRef) jobRef.browser = browser;

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            // Follow the real window size, so maximizing/resizing actually resizes the page
            // instead of leaving a fixed 1920x1080 page inside it.
            viewport: null,
            locale: 'en-US',
            timezoneId: 'Africa/Nairobi',
            acceptDownloads: true
        });

        page = await context.newPage();

        updateJobProgress(currentJobId, 'navigation', 'Navigating to eTA portal...');

        await page.goto('https://www.etakenya.go.ke/en', { waitUntil: 'commit' });

        const data = requestData.formData;

        // Helper function to clean and format phone numbers for Kenya
        const cleanPhone = (phone) => {
            if (!phone) return '';

            // Remove ALL whitespace characters including spaces, tabs, newlines
            let cleaned = phone.replace(/\s+/g, '');

            // Remove dashes and parentheses
            cleaned = cleaned.replace(/[\-\(\)]/g, '');

            // If starts with 07, transform to +2547
            if (cleaned.startsWith('07')) {
                cleaned = '+254' + cleaned.substring(1);
            }

            return cleaned;
        };

        // Initialize helpers using the Playwright page instance
        const formHelpers = createFormHelpers(page);
        const { selectDatePickerDate, downloadFile } = formHelpers;

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // --- PREPARE FILES ---
        const prepareFile = async (rawPath, label) => {
            if (!rawPath) return null;
            if (rawPath.startsWith('http')) {
                console.log(`📥 Downloading ${label} from URL...`);
                const localPath = await downloadFile(rawPath);
                if (localPath) downloadedPaths.push(localPath);
                return localPath;
            }
            return rawPath;
        };
        // All at once rather than one after another - they're independent, and in sequence the
        // six or seven downloads added ~10-15s before the portal steps could start.
        const [passport, selfie, airline, hotel, employer, invitation, hostId] = await Promise.all([
            prepareFile(data.passportBiodataPath, 'Passport'),
            prepareFile(data.photoPath || data.selfiePath, 'Selfie'),
            prepareFile(data.airlineBookingPath, 'Airline'),
            prepareFile(data.accommodationBookingPath, 'Hotel'),
            prepareFile(data.employerLetterPath, 'Employer Letter'),
            prepareFile(data.invitationLetterPath, 'Invitation'),
            prepareFile(data.hostIdPath, 'Host ID'),
        ]);
        const uploads = { passport, selfie, airline, hotel, employer, invitation, hostId };

        if (!uploads.passport) {
            throw new Error('Missing required document: passportBiodataPath (job cannot proceed past the passport upload page without it)');
        }
        if (!uploads.selfie) {
            throw new Error('Missing required document: photoPath/selfiePath (job cannot proceed past the selfie upload page without it)');
        }

        // --- STEP 1: NAVIGATION ---
        console.log('🌐 [STEP 1] Already navigated to Home Page, proceeding with selection...');

        await page.locator('div.mt-8 > a').click();
        await page.locator('li:nth-of-type(1) h3').click(); // Tourists & Visitors
        await sleep(1000);
        await page.getByRole('link', { name: 'Continue' }).click();

        console.log('   ☑️ Accepting Agreement...');
        await page.locator('div:nth-of-type(3) > label').click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => { });

        // --- STEP 2: NATIONALITY SELECTION ---
        console.log('🏳️ [STEP 2] Selecting Nationality...');
        const nationality = data.nationality || 'UNITED KINGDOM';
        console.log(`   🌍 Nationality to select: ${nationality}`);

        const searchInput = page.locator('#search');
        await searchInput.waitFor({ state: 'visible' });
        await searchInput.click();

        console.log(`   ⌨️ Typing: ${nationality}...`);
        await searchInput.fill(nationality);
        await sleep(1000); // Wait for search results to populate

        console.log('   🖱️ Finding country from results list...');

        // Get all country results
        const countryResults = page.locator('#country-list span.text-sm');
        const count = await countryResults.count();

        console.log(`   📋 Found ${count} countries matching "${nationality}":`);

        let targetIndex = -1;
        for (let i = 0; i < count; i++) {
            const countryName = await countryResults.nth(i).textContent();
            console.log(`      ${i + 1}. ${countryName?.trim()}`);

            // Check for exact match (case-insensitive)
            if (countryName?.trim().toLowerCase() === nationality.toLowerCase()) {
                targetIndex = i;
                console.log(`   ✅ Exact match found at index ${i}: ${countryName?.trim()}`);
            }
        }

        if (targetIndex === -1) {
            throw new Error(`No exact match found for nationality: ${nationality}`);
        }

        // Click the exact match
        await countryResults.nth(targetIndex).click();
        console.log(`   ✅ Selected: ${nationality}`);

        console.log('   🖱️ Clicking Continue...');
        const continueBtn = page.locator('div.max-w-screen-xl button').filter({ hasText: 'Continue' });
        await continueBtn.waitFor({ state: 'visible' });
        await continueBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => { });

        // --- STEP 3: TYPE ---
        console.log('👤 [STEP 3] Selecting Individual Application...');
        await page.locator('div.max-w-screen-xl a.block').click();

        // --- STEP 4: PASSPORT UPLOAD & OCR ---
        if (uploads.passport){
            console.log('📤 [STEP 4] Uploading Passport...');
            await handleDocumentUpload(page, '#form-passport_info', uploads.passport, 'Passport');
            console.log('   ⏳ Waiting for OCR Processing...');
            const decl = page.locator('#passport_declaration');
            await decl.waitFor({ state: 'visible', timeout: 60000 });
            await decl.click();
            await sleep(500);
            await page.locator('div.max-w-screen-xl button').click();
        }

        // --- STEP 4.5: SELFIE UPLOAD (HANDLING LAG) ---
        if (uploads.selfie) {
            console.log('📸 [STEP 4.5] Uploading Selfie...');
            await handleDocumentUpload(page, '#form-photo', uploads.selfie, 'Selfie');
            console.log('   ⏳ Waiting for "Continue" button to become active...');
            const continueBtn = page.locator('div.px-6 button, button.bg-primary').filter({ hasText: 'Continue' });
            await page.waitForFunction(() => {
                const btn = document.querySelector('div.px-6 button, button.bg-primary');
                return btn && !btn.disabled;
            }, { timeout: 30000 });
            await continueBtn.click();
            await page.waitForNavigation({ waitUntil: 'networkidle' });
        }

        // --- STEP 5: CONTACT DETAILS ---
        console.log('📝 [STEP 5] Filling Contact Details...');

        const mainPhone = cleanPhone(data.phoneNumber);
        console.log(`   📞 Main phone (cleaned): "${mainPhone}"`);

        // Fill main phone with blur trigger
        const phoneInput = page.locator('#hooked_phone-phone_number');
        await phoneInput.click();
        await phoneInput.fill(mainPhone);
        await phoneInput.blur(); // Trigger phx-debounce="blur"
        await sleep(1000);

        // Fill email
        const emailInput = page.locator('#email');
        await emailInput.click();
        await emailInput.fill(data.emailAddress || '');
        await emailInput.blur();
        await sleep(500);

        // Fill physical address
        const addressInput = page.locator('#physical_address');
        await addressInput.click();
        await addressInput.fill(data.physicalAddress || '');
        await addressInput.blur();
        await sleep(500);

        // Select occupation
        await page.locator('select#contact_info_occupation_id').selectOption({ label: data.occupationId || 'Consultant' });
        await sleep(500);

        // Fill emergency contacts
        if (Array.isArray(data.emergencyContact)) {
            for (let i = 0; i < data.emergencyContact.length; i++) {
                const nameInput = page.locator(`#full_name_${i}`);
                await nameInput.click();
                await nameInput.fill(data.emergencyContact[i].name || '');
                await nameInput.blur();
                await sleep(500);

                const emergencyPhone = cleanPhone(data.emergencyContact[i].phone);
                console.log(`   📞 Emergency contact ${i} phone (cleaned): "${emergencyPhone}"`);

                const emergencyPhoneInput = page.locator(`#hooked_phone-phone_number_${i}`);
                await emergencyPhoneInput.click();
                await emergencyPhoneInput.fill(emergencyPhone);
                await emergencyPhoneInput.blur(); // Trigger phx-debounce="blur"
                await sleep(1000);
            }
        }

        // Try clicking Continue once
        console.log('   ⏳ Attempting to proceed...');
        const contactContinueBtn = page.getByRole('button', { name: 'Continue' });

        try {
            await contactContinueBtn.click({ timeout: 2000, force: true });
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 3000 });
            console.log('   ✅ Continue button clicked successfully!');
        } catch (e) {
            console.warn('   ⚠️ Continue button may still be disabled, but proceeding anyway...');
            // Don't throw error, just proceed - the page might have already moved on
        }

        // --- STEP 6: ARRIVAL ---
        console.log('✈️ [STEP 6] Arrival Details...');
        // arrivalDetails is an ARRAY, so access [0]
        const arrival = (Array.isArray(data.arrivalDetails) ? data.arrivalDetails[0] : data.arrivalDetails) || {};

        await page.locator('#travel_reason_id').selectOption({ label: data.travelReason || 'Tourism' });
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(500);

        // FIXED: Native HTML5 date input - just set the value directly
        console.log('   📅 Setting arrival date...');

        // Convert date from "DD/MM/YYYY" to "YYYY-MM-DD" format
        let arrivalDateFormatted = '';
        if (arrival.date) {
            const parts = arrival.date.split('/'); // "12/02/2026" -> ["12", "02", "2026"]
            if (parts.length === 3) {
                arrivalDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`; // "2026-02-12"
                console.log(`   📅 Arrival date: ${arrival.date} -> ${arrivalDateFormatted}`);
            }
        }

        if (arrivalDateFormatted) {
            await page.locator('#arrival_date').fill(arrivalDateFormatted);
            await sleep(500);
        } else {
            console.warn('   ⚠️ No valid arrival date provided');
        }

        // Determine arrival mode from the "means" field
        const arrivalMeans = (arrival.means || 'Arriving by Air').toLowerCase();
        console.log(`   🚢 Selecting arrival means: ${arrivalMeans}`);

        if (arrivalMeans.includes('air')) {
            console.log('   ✈️ Clicking "Arriving by Air"...');
            await page.locator('label:nth-of-type(1) > span').click(); // Air
            await sleep(1000); // Wait for form to update

            console.log(`   🛫 Selecting airline: ${arrival.airline}`);
            await page.locator('#arrival_travel_means_owner_id').selectOption({ label: arrival.airline });
            await sleep(1500); // Wait for flight numbers to populate

            // Get available flight number options
            console.log(`   🔍 Fetching available flight numbers...`);
            const flightOptions = await page.locator('#arrival_travel_means_id option').allTextContents();
            console.log(`   📋 Available flight numbers (${flightOptions.length}):`, flightOptions.slice(0, 10).join(', '));

            // Try to find matching flight number
            const targetFlight = arrival.flightNumber;
            console.log(`   🎯 Looking for flight number: ${targetFlight}`);

            let matchedFlight = null;

            // First try exact match
            for (const option of flightOptions) {
                if (option.trim() === targetFlight) {
                    matchedFlight = option.trim();
                    console.log(`   ✅ Exact match found: ${matchedFlight}`);
                    break;
                }
            }

            // If no exact match, try partial match (contains)
            if (!matchedFlight) {
                for (const option of flightOptions) {
                    if (option.includes(targetFlight) || targetFlight.includes(option.trim())) {
                        matchedFlight = option.trim();
                        console.log(`   ✅ Partial match found: ${matchedFlight}`);
                        break;
                    }
                }
            }

            if (matchedFlight) {
                console.log(`   🔢 Selecting flight number: ${matchedFlight}`);
                await page.locator('#arrival_travel_means_id').selectOption({ label: matchedFlight });
                await sleep(500);
            } else {
                console.warn(`   ⚠️ Flight number "${targetFlight}" not found. Adding manually...`);

                // Click "Can't find your Airline or Flight Number?" link
                const cantFindLink = page.locator('form > div > div.p-4 a').filter({ hasText: "Can't find your" });
                await cantFindLink.click();
                await sleep(1000);

                // Fill in airline name
                console.log(`   ✍️ Entering airline manually: ${arrival.airline}`);
                await page.locator('#add_travel_means_form > div:nth-of-type(1) > div > div:nth-of-type(2) input').fill(arrival.airline);
                await sleep(500);

                // Fill in flight number
                console.log(`   ✍️ Entering flight number manually: ${targetFlight}`);
                await page.locator('#add_travel_means_form > div:nth-of-type(2) input').fill(targetFlight);
                await sleep(500);

                // Click Add button
                console.log(`   ➕ Adding manual entry...`);
                await page.locator('#add_travel_means_modal-content button').filter({ hasText: 'Add' }).click();
                await sleep(1500);
            }

            console.log(`   🛬 Selecting arrival port: ${arrival.port}`);
            await page.locator('#arrival_border_point_id').selectOption({ label: arrival.port });
            await sleep(500);

            console.log(`   🌍 Selecting country of origin: ${arrival.countryOfOrigin}`);
            await page.locator('#country_of_origin_id').selectOption({ label: arrival.countryOfOrigin });
            await sleep(500);
        } else if (arrivalMeans.includes('sea')) {
            console.log('   🚢 Clicking "Arriving by Sea"...');
            await page.locator('label:nth-of-type(2) > span').click(); // Sea
            await sleep(1000);

            console.log(`   ⛴️ Selecting vessel: ${arrival.vesselName}`);
            await page.locator('#arrival_travel_means_owner_id').selectOption({ label: arrival.vesselName });
            await sleep(500);

            console.log(`   🛬 Selecting arrival port: ${arrival.port}`);
            await page.locator('#arrival_border_point_id').selectOption({ label: arrival.port });
            await sleep(500);

            console.log(`   🌍 Selecting country of origin: ${arrival.countryOfOrigin}`);
            await page.locator('#country_of_origin_id').selectOption({ label: arrival.countryOfOrigin });
            await sleep(500);
        } else if (arrivalMeans.includes('land')) {
            console.log('   🚗 Clicking "Arriving by Land"...');
            await page.locator('label:nth-of-type(3) > span').click(); // Land
            await sleep(1000);

            console.log(`   🚪 Selecting border point: ${arrival.port}`);
            await page.locator('#arrival_border_point_id').selectOption({ label: arrival.port });
            await sleep(500);

            console.log(`   🌍 Selecting country of origin: ${arrival.countryOfOrigin}`);
            await page.locator('#country_of_origin_id').selectOption({ label: arrival.countryOfOrigin });
            await sleep(500);
        }

        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(500);

        // --- STEP 7: DEPARTURE ---
        console.log('🛫 [STEP 7] Departure Details...');
        // departureDetails is an ARRAY, so access [0]
        const departure = (Array.isArray(data.departureDetails) ? data.departureDetails[0] : data.departureDetails) || {};

        // FIXED: Native HTML5 date input - just set the value directly
        console.log('   📅 Setting departure date...');

        // Convert date from "DD/MM/YYYY" to "YYYY-MM-DD" format
        let departureDateFormatted = '';
        if (departure.date) {
            const parts = departure.date.split('/'); // "13/03/2026" -> ["13", "03", "2026"]
            if (parts.length === 3) {
                departureDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`; // "2026-03-13"
                console.log(`   📅 Departure date: ${departure.date} -> ${departureDateFormatted}`);
            }
        }

        if (departureDateFormatted) {
            await page.locator('#departure_date').fill(departureDateFormatted);
            await sleep(500);
        } else {
            console.warn('   ⚠️ No valid departure date provided');
        }

        // Determine departure mode from the "means" field
        const departureMeans = (departure.means || 'Departing by Air').toLowerCase();
        console.log(`   🚢 Selecting departure means: ${departureMeans}`);

        if (departureMeans.includes('air')) {
            console.log('   ✈️ Clicking "Departing by Air"...');
            await page.locator('label:nth-of-type(1) > span').click(); // Air
            await sleep(1000); // Wait for form to update

            console.log(`   🛫 Selecting airline: ${departure.airline}`);
            await page.locator('#departure_travel_means_owner_id').selectOption({ label: departure.airline });
            await sleep(1500); // Wait for flight numbers to populate

            // Get available flight number options
            console.log(`   🔍 Fetching available flight numbers...`);
            const departureFlightOptions = await page.locator('#departure_travel_means_id option').allTextContents();
            console.log(`   📋 Available flight numbers (${departureFlightOptions.length}):`, departureFlightOptions.slice(0, 10).join(', '));

            // Try to find matching flight number
            const targetDepartureFlight = departure.flightNumber;
            console.log(`   🎯 Looking for flight number: ${targetDepartureFlight}`);

            let matchedDepartureFlight = null;

            // First try exact match
            for (const option of departureFlightOptions) {
                if (option.trim() === targetDepartureFlight) {
                    matchedDepartureFlight = option.trim();
                    console.log(`   ✅ Exact match found: ${matchedDepartureFlight}`);
                    break;
                }
            }

            // If no exact match, try partial match (contains)
            if (!matchedDepartureFlight) {
                for (const option of departureFlightOptions) {
                    if (option.includes(targetDepartureFlight) || targetDepartureFlight.includes(option.trim())) {
                        matchedDepartureFlight = option.trim();
                        console.log(`   ✅ Partial match found: ${matchedDepartureFlight}`);
                        break;
                    }
                }
            }

            if (matchedDepartureFlight) {
                console.log(`   🔢 Selecting flight number: ${matchedDepartureFlight}`);
                await page.locator('#departure_travel_means_id').selectOption({ label: matchedDepartureFlight });
                await sleep(500);
            } else {
                console.warn(`   ⚠️ Flight number "${targetDepartureFlight}" not found. Using first available option.`);
                if (departureFlightOptions.length > 1) {
                    await page.locator('#departure_travel_means_id').selectOption({ index: 1 });
                }
                await sleep(500);
            }

            console.log(`   🛫 Selecting departure port: ${departure.port}`);
            await page.locator('#departure_border_point_id').selectOption({ label: departure.port });
            await sleep(500);

            console.log(`   🌍 Selecting destination country: ${departure.destinationCountry}`);
            await page.locator('#destination_country_id').selectOption({ label: departure.destinationCountry });
            await sleep(500);
        } else if (departureMeans.includes('sea')) {
            console.log('   🚢 Clicking "Departing by Sea"...');
            await page.locator('label:nth-of-type(2) > span').click(); // Sea
            await sleep(1000);

            console.log(`   ⛴️ Selecting vessel: ${departure.vesselName}`);

            // Try to select vessel from dropdown
            try {
                await page.locator('#departure_travel_means_owner_id').selectOption({ label: departure.vesselName }, { timeout: 5000 });
                await sleep(500);
            } catch (error) {
                console.warn(`   ⚠️ Vessel "${departure.vesselName}" not found. Adding manually...`);

                // Click "Can't find your Cruise Line or Vessel?" link
                const cantFindLink = page.locator('form > div > div.p-4 a').filter({ hasText: "Can't find your" });
                await cantFindLink.click();
                await sleep(1000);

                // Fill in vessel name
                console.log(`   ✍️ Entering vessel manually: ${departure.vesselName}`);
                await page.locator('#add_travel_means_form > div:nth-of-type(1) > div > div:nth-of-type(2) input').fill(departure.vesselName);
                await sleep(500);

                // Fill in vessel number (use a dummy value if not provided)
                const vesselNumber = departure.vesselNumber || '00000';
                console.log(`   ✍️ Entering vessel number manually: ${vesselNumber}`);
                await page.locator('#add_travel_means_form > div:nth-of-type(2) input').fill(vesselNumber);
                await sleep(500);

                // Click Add button
                console.log(`   ➕ Adding manual entry...`);
                await page.locator('#add_travel_means_modal-content button').filter({ hasText: 'Add' }).click();
                await sleep(1500);
            }

            console.log(`   🛫 Selecting departure port: ${departure.port}`);
            await page.locator('#departure_border_point_id').selectOption({ label: departure.port });
            await sleep(500);

            console.log(`   🌍 Selecting destination country: ${departure.destinationCountry}`);
            await page.locator('#destination_country_id').selectOption({ label: departure.destinationCountry });
            await sleep(500);
        } else if (departureMeans.includes('land')) {
            console.log('   🚗 Clicking "Departing by Land"...');
            await page.locator('label:nth-of-type(3) > span').click(); // Land
            await sleep(1000);

            console.log(`   🚪 Selecting border point: ${departure.port}`);
            await page.locator('#departure_border_point_id').selectOption({ label: departure.port });
            await sleep(500);

            console.log(`   🌍 Selecting destination country: ${departure.destinationCountry}`);
            await page.locator('#destination_country_id').selectOption({ label: departure.destinationCountry });
            await sleep(500);
        }

        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(500);

        // --- STEP 8: ACCOMMODATIONS ---
        console.log('🏨 [STEP 8] Filling Accommodation...');
        if (Array.isArray(data.accommodations)) {
            for (let i = 0; i < data.accommodations.length; i++) {
                const hotel = data.accommodations[i];
                await page.locator('#name').fill(hotel.name);

                // FIXED: Native HTML5 date inputs - just set the values directly
                console.log(`   📅 Setting dates for ${hotel.name}...`);

                // Convert check-in date from "DD/MM/YYYY" to "YYYY-MM-DD"
                if (hotel.fromDate) {
                    const fromParts = hotel.fromDate.split('/');
                    if (fromParts.length === 3) {
                        const fromFormatted = `${fromParts[2]}-${fromParts[1]}-${fromParts[0]}`;
                        console.log(`   📅 Check-in: ${hotel.fromDate} -> ${fromFormatted}`);
                        await page.locator('#from_date').fill(fromFormatted);
                        await sleep(500);
                    }
                }

                // Convert check-out date from "DD/MM/YYYY" to "YYYY-MM-DD"
                if (hotel.toDate) {
                    const toParts = hotel.toDate.split('/');
                    if (toParts.length === 3) {
                        const toFormatted = `${toParts[2]}-${toParts[1]}-${toParts[0]}`;
                        console.log(`   📅 Check-out: ${hotel.toDate} -> ${toFormatted}`);
                        await page.locator('#to_date').fill(toFormatted);
                        await sleep(500);
                    }
                }

                await page.getByRole('button', { name: 'Save' }).click();
                await sleep(1000);
                if (i < data.accommodations.length - 1) {
                    await page.locator('span').filter({ hasText: 'Add Another' }).click();
                }
            }
        }
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(500);

        // --- STEP 9: BACKGROUND ---
        console.log('🕵️ [STEP 9] Background Info...');
        const p = (Array.isArray(data.personal) ? data.personal[0] : data.personal) || {};

        // Is your trip financed by a third party, which is not your employer nor a government?
        const backgroundFinances = Array.isArray(data.finances) ? data.finances[0] : data.finances;
        const isFinancedByThirdParty = p.isTripFinanced === 'true';
        console.log(`   💰 Raw p.isTripFinanced: ${p.isTripFinanced}`);
        console.log(`   💰 Trip financed by third party: ${p.isTripFinanced} -> ${isFinancedByThirdParty ? 'Yes' : 'No'}`);

        if (isFinancedByThirdParty) {
            console.log('   ✅ Clicking "Yes" for third party financing...');
            console.log('   🎯 Target selector: input[name="financed_trip"][value="true"]');
            await page.locator('input[name="financed_trip"][value="true"]').click();
        } else {
            console.log('   ❌ Clicking "No" for third party financing...');
            console.log('   🎯 Target selector: input[name="financed_trip"][value="false"]');
            await page.locator('input[name="financed_trip"][value="false"]').click();
        }
        await sleep(500);

        // Country of Birth - with option fetching and matching
        console.log(`   🌍 Selecting country of birth: ${p.countryOfBirth}`);
        const birthCountryOptions = await page.locator('#country_of_birth_id option').allTextContents();
        console.log(`   📋 Available countries (${birthCountryOptions.length})`);

        let matchedBirthCountry = null;
        for (const option of birthCountryOptions) {
            if (option.trim().toLowerCase() === p.countryOfBirth?.toLowerCase()) {
                matchedBirthCountry = option.trim();
                console.log(`   ✅ Exact match found: ${matchedBirthCountry}`);
                break;
            }
        }

        if (!matchedBirthCountry) {
            for (const option of birthCountryOptions) {
                if (option.toLowerCase().includes(p.countryOfBirth?.toLowerCase()) ||
                    p.countryOfBirth?.toLowerCase().includes(option.trim().toLowerCase())) {
                    matchedBirthCountry = option.trim();
                    console.log(`   ✅ Partial match found: ${matchedBirthCountry}`);
                    break;
                }
            }
        }

        if (matchedBirthCountry) {
            await page.locator('#country_of_birth_id').selectOption({ label: matchedBirthCountry });
        } else {
            console.warn(`   ⚠️ Country "${p.countryOfBirth}" not found`);
        }
        await sleep(500);

        // Nationality at Birth - with option fetching and matching
        console.log(`   🌍 Selecting nationality at birth: ${p.nationalityAtBirth}`);
        const nationalityOptions = await page.locator('#nationality_id option').allTextContents();
        console.log(`   📋 Available nationalities (${nationalityOptions.length})`);

        let matchedNationality = null;
        for (const option of nationalityOptions) {
            if (option.trim().toLowerCase() === p.nationalityAtBirth?.toLowerCase()) {
                matchedNationality = option.trim();
                console.log(`   ✅ Exact match found: ${matchedNationality}`);
                break;
            }
        }

        if (!matchedNationality) {
            for (const option of nationalityOptions) {
                if (option.toLowerCase().includes(p.nationalityAtBirth?.toLowerCase()) ||
                    p.nationalityAtBirth?.toLowerCase().includes(option.trim().toLowerCase())) {
                    matchedNationality = option.trim();
                    console.log(`   ✅ Partial match found: ${matchedNationality}`);
                    break;
                }
            }
        }

        if (matchedNationality) {
            await page.locator('#nationality_id').selectOption({ label: matchedNationality });
        } else {
            console.warn(`   ⚠️ Nationality "${p.nationalityAtBirth}" not found`);
        }
        await sleep(500);

        // Have you ever been convicted of any offence, under any system of law, in the past 5 years?
        const hasConvictions = p.recentlyConvicted === 'true';
        console.log(`   ⚖️ Recently convicted: ${p.recentlyConvicted} -> ${hasConvictions ? 'Yes' : 'No'}`);

        if (hasConvictions) {
            console.log('   ✅ Clicking "Yes" for recent convictions...');
            console.log('   🎯 Target selector: input[name="recently_convicted"][value="true"]');
            await page.locator('input[name="recently_convicted"][value="true"]').click();

            // Fill conviction details if provided
            if (p.convictionDetails) {
                console.log('   📝 Adding conviction details...');
                await page.locator('#conviction_details').fill(p.convictionDetails);
                await sleep(500);
            }
        } else {
            console.log('   ❌ Clicking "No" for recent convictions...');
            console.log('   🎯 Target selector: input[name="recently_convicted"][value="false"]');
            await page.locator('input[name="recently_convicted"][value="false"]').click();
        }
        await sleep(500);

        // Have you ever been previously denied entry to Kenya?
        const previouslyDeniedEntry = p.previouslyDeniedEntry === 'true';
        console.log(`   🚫 Previously denied entry: ${p.previouslyDeniedEntry} -> ${previouslyDeniedEntry ? 'Yes' : 'No'}`);

        if (previouslyDeniedEntry) {
            console.log('   ✅ Clicking "Yes" for previously denied entry...');
            console.log('   🎯 Target selector: input[name="previously_denied_entry"][value="true"]');
            await page.locator('input[name="previously_denied_entry"][value="true"]').click();
        } else {
            console.log('   ❌ Clicking "No" for previously denied entry...');
            console.log('   🎯 Target selector: input[name="previously_denied_entry"][value="false"]');
            await page.locator('input[name="previously_denied_entry"][value="false"]').click();
        }
        await sleep(500);

        const maritalMap = { 'single': 0, 'married': 1, 'separated': 2, 'divorced': 3, 'widowed': 4 };
        const maritalStatusValue = p.maritalStatus?.toLowerCase();
        const maritalIndex = maritalMap[maritalStatusValue] || 0;
        console.log(`   💍 Marital status value: "${maritalStatusValue}" -> index: ${maritalIndex}`);

        // Use the correct selector for marital status radio buttons
        const maritalLabels = page.locator('input[name="marital_status"]');
        await maritalLabels.nth(maritalIndex).click();
        console.log(`   ✅ Selected marital status option at index ${maritalIndex}`);

        // Have you previously visited Kenya more than three times?
        const visitedKenyaMultipleTimes = p.firstTimeVisit === 'false';
        console.log(`   🇰🇪 First time visit: ${p.firstTimeVisit} -> ${visitedKenyaMultipleTimes ? 'Yes (multiple visits)' : 'No (first time)'}`);

        if (visitedKenyaMultipleTimes) {
            console.log('   ✅ Clicking "Yes" for multiple Kenya visits...');
            console.log('   🎯 Target selector: input[name="first_time_visit"][value="false"]');
            await page.locator('input[name="first_time_visit"][value="false"]').click();
        } else {
            console.log('   ❌ Clicking "No" for multiple Kenya visits...');
            console.log('   🎯 Target selector: input[name="first_time_visit"][value="true"]');
            await page.locator('input[name="first_time_visit"][value="true"]').click();
        }
        await sleep(500);

        console.log('   ⏳ Waiting for Continue button to be clickable...');
        await sleep(500);

        // Try multiple approaches to click Continue button
        const backgroundContinueBtn = page.getByRole('button', { name: 'Continue' });

        try {
            // Wait for button to be enabled
            await backgroundContinueBtn.waitFor({ state: 'visible', timeout: 10000 });
            await sleep(500);

            // Try direct click first
            await backgroundContinueBtn.click({ timeout: 5000 });
            console.log('   ✅ Continue button clicked successfully');
        } catch (error) {
            console.log('   ⚠️ Direct click failed, trying alternative approaches...');

            try {
                // Try clicking with force
                await backgroundContinueBtn.click({ force: true, timeout: 5000 });
                console.log('   ✅ Continue button clicked with force');
            } catch (forceError) {
                console.log('   ⚠️ Force click failed, trying JavaScript click...');

                try {
                    // Try JavaScript click
                    await page.evaluate(() => {
                        const btn = document.querySelector('button[type="submit"]');
                        if (btn && !btn.disabled) {
                            btn.click();
                        }
                    });
                    console.log('   ✅ Continue button clicked via JavaScript');
                } catch (jsError) {
                    console.log('   ⚠️ JavaScript click failed, trying Enter key...');

                    // Try pressing Enter on the button
                    await backgroundContinueBtn.press('Enter');
                    console.log('   ✅ Continue button activated via Enter key');
                }
            }
        }

        // Wait for navigation after clicking Continue
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {
            console.log('   ℹ️ Navigation may have already occurred or is still in progress');
        });

        // --- STEP 10: CUSTOMS ---
        console.log('📋 [STEP 10] Customs...');

        // Check if there are any customs/finances data to declare
        const finances = Array.isArray(data.customsFinances) ? data.customsFinances[0] : data.customsFinances;
        const hasCustomsData = finances && (finances.sourceId || finances.currencyId || finances.amount);

        console.log(`   💰 Has customs data to declare: ${hasCustomsData}`);

        if (hasCustomsData) {
            console.log('   ✅ Clicking "Yes" for customs declaration...');
            await page.locator('div.max-w-screen-xl label:nth-of-type(1) > input').click();
            await sleep(1000);

            // Fill customs form if data is provided
            if (finances.sourceId) {
                console.log(`   📋 Selecting source: ${finances.sourceId}`);
                await page.locator('div.mt-4 > div.w-full > div > div > div > div:nth-of-type(1) select').selectOption({ label: finances.sourceId });
                await sleep(500);
            }

            if (finances.currencyId) {
                console.log(`   💱 Selecting currency: ${finances.currencyId}`);
                await page.locator('div.w-full > div > div > div > div:nth-of-type(2) select').selectOption({ label: finances.currencyId });
                await sleep(500);
            }

            if (finances.amount) {
                console.log(`   💰 Entering amount: ${finances.amount}`);
                await page.locator('#amount').fill(finances.amount.toString());
                await sleep(500);
            }

            // Save the customs declaration
            console.log('   💾 Saving customs declaration...');
            await page.locator('div.h-\\[calc\\(60vh_-_40px\\)\\] span').filter({ hasText: 'Save' }).click();
            await sleep(2000);
        } else {
            console.log('   ❌ Clicking "No" for customs declaration...');
            await page.locator('label:nth-of-type(2) > input').click();
            await sleep(1000);
        }

        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(500);

        console.log('📁 [STEP 11] Performing Document Uploads...');
        updateJobProgress(currentJobId, 'uploads', 'Uploading documents...');

        const uploadQueue = [
            { path: uploads.airline, name: 'airline_cruise_booking_confirmation' },
            { path: uploads.hotel, name: 'accommodation_booking_confirmations' },
            { path: uploads.employer, name: 'letter_from_employer' },
            { path: uploads.invitation, name: 'invitation_letter' },
            { path: uploads.hostId, name: 'identity_card_of_host' }
        ].filter(u => u.path && fs.existsSync(u.path));

        for (const item of uploadQueue) {
            const input = page.locator(`input[name="${item.name}"]`);
            if (await input.count() > 0) {
                console.log(`   📤 Uploading: ${item.name}`);
                await input.setInputFiles(item.path);
                // Wait for the UI to reflect the upload (LiveView state update)
                await page.waitForTimeout(2500);
            }
        }

        console.log('   ⏳ Waiting for Continue button to enable...');
        const uploadContinueBtn = page.getByRole('button', { name: 'Continue' });

        // CRITICAL: Ensure the button is not disabled before clicking
        await page.waitForFunction(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Continue'));
            return btn && !btn.disabled;
        }, { timeout: 20000 });

        await uploadContinueBtn.click();
        console.log('   ✅ Upload page submitted');

        // --- STEP 12: CONFIRMATION & DECLARATION ---
        updateJobProgress(currentJobId, 'confirmation', 'Confirming submission...');

        // Use a more robust selector for the declaration checkbox
        const confirmLabel = page.locator('label').filter({ hasText: /I confirm that/i }).first();
        await confirmLabel.waitFor({ state: 'visible', timeout: 15000 });
        await confirmLabel.click();
        console.log('   ✅ Declaration checked');

        const finalContinue = page.getByRole('button', { name: 'Continue' });
        await finalContinue.waitFor({ state: 'visible' });
        await finalContinue.click();

        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => { });

        // --- STEP 13: PAYMENT TYPE & FINALIZE ---
        updateJobProgress(currentJobId, 'payment', 'Selecting payment type...');
        const isMultiEntry = data.isMultiEntry === true || data.isMultiEntry === 'true';

        const entryTypeSelector = isMultiEntry ? '#multi_entry' : '#single_entry';
        await page.locator(entryTypeSelector).waitFor({ state: 'visible' });
        await page.locator(entryTypeSelector).click();

        console.log('   🖱️ Clicking Final Submission Continue...');
        await page.locator('button.btn-primary').filter({ hasText: 'Continue' }).click();

        // Wait for the final payment gateway redirect or confirmation screen
        await sleep(5000);

        // --- FINAL SCREENSHOT & DB UPDATE ---
        console.log('📸 Capturing outcome proof...');
        const screenshotBase64 = await page.screenshot({ encoding: 'base64', fullPage: true });

        // Persistence is delegated instead of done here. This used to write
        // tm_tasks directly through a Supabase service-role client created at
        // module load. In a per-user desktop install that key ships inside the
        // packaged app, so anyone who unpacked the installer would hold full DB
        // admin. The server now owns all writes; `onComplete` forwards the proof
        // to the Next process, which holds the key and scopes the write to the
        // signed-in user.
        if (taskId && typeof onComplete === 'function') {
            try {
                await onComplete({ taskId, screenshotBase64 });
                console.log(`   ✅ Proof handed off for task ${taskId}`);
            } catch (persistError) {
                // A failed proof write must not fail an otherwise successful
                // application - the eTA submission itself already went through.
                console.error(`   ⚠️ Could not save proof for task ${taskId}: ${persistError.message}`);
            }
        }

        updateJobProgress(currentJobId, 'complete', 'Automation finished');
        return {
            success: true,
            taskId: taskId || null,
            screenshot: screenshotBase64,
        };

    } catch (error) {
        console.error('❌ eTA Kenya failed:', error.message);
        await saveFailureSnapshot(page, currentJobId);
        const cancelled = activeJobs.get(currentJobId)?.stopRequested === true;
        if (!cancelled) throw error;
        return { success: false, cancelled: true, error: 'Stopped by user' };
    } finally {
        if (browser) await browser.close();
        downloadedPaths.forEach(p => safeRemoveFile(p));
        // Nothing to restore: the run console is a function-scoped const that
        // shadows the global rather than reassigning it.
        const finishedJob = activeJobs.get(currentJobId);
        if (finishedJob) finishedJob.isRunning = false;
    }
}