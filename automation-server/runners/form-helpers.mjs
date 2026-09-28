import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates automation helper functions for form interactions
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Object} Helper functions for form automation
 */
export function createFormHelpers(page) {
    /**
     * Capitalizes the first letter of each word in a string
     */
    function capitalizeText(str) {
        if (typeof str !== 'string') return str;
        return str
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Fills a form field or selects an option from a dropdown
     */
    async function fillOrSelect(selector, value, fieldName = selector) {
        if (value === undefined || value === null || value === 'Missing' || value === '') {
            console.log(`⚠️ [SKIP] ${fieldName} - Value: "${value}" (blank/missing)`);
            return;
        }

        // Wait for element to be attached
        const element = page.locator(selector).first();
        try {
            await element.waitFor({ state: 'attached', timeout: 2000 });
        } catch (e) {
            console.log(`❌ Element not found: ${selector}`);
            return;
        }

        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        const inputType = await element.getAttribute('type');
        
        // LOGIC BRANCHING
        if (tagName === 'select') {
            await handleDropdown(element, value, fieldName);
        } else if (inputType === 'date') {
            await element.fill(formatDateForInput(value));
            console.log(`✅ [DATE INPUT] Set ${fieldName} to ${value}`);
        } else if (inputType === 'email') {
            await element.fill(String(value).toLowerCase());
            console.log(`✅ [FILL] Set ${fieldName} to "${value}"`);
        } else if (inputType === 'number' || inputType === 'tel') {
            await element.fill(String(value));
            console.log(`✅ [FILL] Set ${fieldName} to "${value}"`);
        } else {
            const formattedValue = capitalizeText(String(value));
            await element.fill(formattedValue);
            console.log(`✅ [FILL] Set ${fieldName} to "${formattedValue}"`);
        }
    }

    /**
     * Handles dropdown selection with flexible matching
     */
async function handleDropdown(element, value, fieldName) {
    const strValue = String(value).trim();
    
    // Normalize text for comparison logic
    const normalize = (text) => text.toLowerCase().replace(/['’]/g, "'").trim();
    const normalizedVal = normalize(strValue);

    // Perform all matching logic inside one evaluate call for speed
    const matchValue = await element.evaluate((el, target) => {
        const norm = (t) => t.toLowerCase().replace(/['’]/g, "'").trim();
        const options = Array.from(el.options);
        
        // 1. Value match
        let m = options.find(o => norm(o.value) === target);
        // 2. Exact text
        if (!m) m = options.find(o => norm(o.text) === target);
        // 3. Partial text
        if (!m) m = options.find(o => norm(o.text).includes(target));
        
        if (m) {
            el.value = m.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return m.text;
        }
        return null;
    }, normalizedVal);

    if (matchValue) {
        console.log(`✅ [SELECT] ${fieldName}: Matched "${strValue}" to "${matchValue}"`);
    } else {
        console.warn(`⚠️ [SELECT] ${fieldName}: No match found for "${strValue}", trying direct label selection`);
        try {
            await element.selectOption({ label: strValue });
        } catch (e) {
            try { await element.selectOption(strValue); } catch (ex) {
                 console.error(`❌ [SELECT] Failed to select "${strValue}"`);
            }
        }
    }
}

    /**
     * Selects a date from the legacy 'scw' date picker
     * FIX: Uses selectOption instead of fill for Year/Month dropdowns
     */
    async function selectDatePickerDate(rowSelector, dateObj, label) {
        if (!dateObj || dateObj === 'Missing' || dateObj === 'Field Not Found') {
            console.log(`⚠️ [SKIP] ${label} - Date value: "${dateObj}" (blank/missing)`);
            return;
        }

        let d, m, y;
        
        // Parse date string (DD/MM/YYYY or YYYY-MM-DD) or Object
        if (typeof dateObj === 'string') {
            if (dateObj.includes('/')) {
                [d, m, y] = dateObj.split('/');
                const date = new Date(y, parseInt(m) - 1, d);
                m = date.toLocaleString('default', { month: 'short' }).substring(0, 3); 
            } else {
                const date = new Date(dateObj);
                if (!isNaN(date.getTime())) {
                    d = date.getDate().toString();
                    m = date.toLocaleString('default', { month: 'short' }).substring(0, 3);
                    y = date.getFullYear().toString();
                } else {
                    console.log(`❌ [DATE] Invalid date format for ${label}: ${dateObj}`);
                    return;
                }
            }
        } else {
            d = dateObj.day;
            m = dateObj.month;
            y = dateObj.year;
        }

        // Ensure day doesn't have leading zero for the cell click (e.g. "5" not "05")
        const dayToClick = parseInt(d).toString();

        console.log(`📅 [DATE] Selecting ${label}: ${dayToClick} ${m} ${y}`);
        
        try {
            // 1. Click the input field to open the calendar pop-up
            await page.locator(rowSelector).first().click();
            
        // 2. Wait for the Year Dropdown (#scwYears)
        const yearSelect = page.locator('#scwYears');
        await yearSelect.waitFor({ state: 'visible', timeout: 2000 });

            // 3. Select Year (Using selectOption, NOT fill)
            try {
                await yearSelect.selectOption(y.toString());
            } catch (yearError) {
                console.log(`⚠️ [DATE] Year selectOption failed, trying fallback click+type...`);
                await yearSelect.click();
                await page.keyboard.type(y.toString());
                await page.keyboard.press('Enter');
            }
            
            // 4. Select Month (Using selectOption, NOT fill)
            const monthSelect = page.locator('#scwMonths');
            await monthSelect.waitFor({ state: 'visible', timeout: 2000 });
            
            try {
                // Try label (e.g., "Sep", "Sept", "September")
                await monthSelect.selectOption({ label: m });
            } catch (monthError) {
                console.log(`⚠️ [DATE] Month selectOption failed for "${m}", trying fallback click+type...`);
                await monthSelect.click();
                await page.keyboard.type(m);
                await page.keyboard.press('Enter');
            }
            
            // 5. Click the Day Cell
            await page.getByRole('cell', { name: dayToClick, exact: true }).first().click();

        } catch (e) {
            console.error(`❌ [DATE] Failed to select date for ${label}:`, e.message);
            // We throw error here so the main script knows it failed, 
            // or comment this out if you want to continue despite date failure
            throw e; 
        }
    }

    /**
     * Helper to format date for HTML date input (YYYY-MM-DD)
     */
    function formatDateForInput(date) {
        if (!date) return '';
        let d, m, y;
        if (typeof date === 'string') {
            if (date.includes('/')) {
                [d, m, y] = date.split('/');
            } else {
                const dateObj = new Date(date);
                if (!isNaN(dateObj.getTime())) {
                    d = String(dateObj.getDate()).padStart(2, '0');
                    m = String(dateObj.getMonth() + 1).padStart(2, '0');
                    y = dateObj.getFullYear();
                    return `${y}-${m}-${d}`;
                }
                return '';
            }
        } else {
            d = date.day;
            m = date.month;
            y = date.year;
        }
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    /**
     * Uploads a file to a file input
     */
    async function uploadFile(selector, filePath) {
        if (!filePath || !fs.existsSync(filePath)) {
            console.log(`⚠️ [UPLOAD] File not found: ${filePath}`);
            return false;
        }
        
        // Warn about PDF files for photo uploads
        const fileExt = path.extname(filePath).toLowerCase();
        if (selector.includes('photo') && fileExt === '.pdf') {
            console.warn(`⚠️ [UPLOAD WARNING] Uploading PDF for photo field. Immigration portals typically require JPG/PNG images!`);
            console.warn(`   File: ${path.basename(filePath)}`);
            console.warn(`   This may cause the application to fail validation.`);
        }
        
        try {
            await page.locator(selector).setInputFiles(filePath);
            console.log(`✅ [UPLOAD] Uploaded file: ${path.basename(filePath)}`);
            return true;
        } catch (e) {
            console.error(`❌ [UPLOAD] Failed to upload file: ${e.message}`);
            return false;
        }
    }

    /**
     * Downloads a file from a URL
     */
    async function downloadFile(url, outputPath) {
        if (!url) throw new Error('URL is required');
        url = url.replace(/\s+/g, '').replace(/%20\//g, '/').replace(/\/%20/g, '/');
        const tempPath = outputPath || path.join(__dirname, `temp_${Date.now()}_${path.basename(url).split('?')[0]}`);
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(tempPath);
            protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(tempPath);
                });
            }).on('error', (err) => {
                fs.unlink(tempPath, () => {});
                reject(err);
            });
        });
    }

    return {
        fillOrSelect,
        selectDatePickerDate,
        uploadFile,
        downloadFile,
        formatDateForInput
    };
}

/**
 * Creates a temporary file with the given content
 */
export function createTempFile(content, extension = 'txt') {
    const tempPath = path.join(__dirname, `temp_${Date.now()}.${extension}`);
    fs.writeFileSync(tempPath, content);
    return tempPath;
}

/**
 * Safely removes a file if it exists
 */
export function safeRemoveFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`🧹 Removed temporary file: ${filePath}`);
        } catch (e) {
            console.warn(`⚠️ Failed to remove file ${filePath}:`, e.message);
        }
    }
}

/**
 * Waits for a specified number of seconds
 */
export function wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Downloads an image/file from a URL to a local path
 */
export function downloadImage(url, outputPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(outputPath);
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(outputPath);
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => { });
            reject(err);
        });
        file.on('error', (err) => {
            fs.unlink(outputPath, () => { });
            reject(err);
        });
    });
}

/**
 * Logs into the EFNS immigration portal
 * @param {import('playwright').Page} page
 * @param {{email: string, idNumber: string, password: string}} credentials
 * @param {string} [url] - Login URL (defaults to EFNS login page)
 */
export async function loginToPortal(page, credentials, url) {
    console.log('🔐 [STEP] Logging in...');
    await page.goto(url || 'https://fns.immigration.go.ke/account/login.html');
    await page.getByRole('textbox', { name: 'you@example.com' }).fill(credentials.email);
    await page.getByRole('textbox', { name: 'Id No/Passport No/Alien No' }).fill(credentials.idNumber);
    await page.getByRole('textbox', { name: 'Password' }).fill(credentials.password);
    await page.getByRole('button', { name: 'Login' }).click();
}

/**
 * Dismisses the notification/close popup if present
 * @param {import('playwright').Page} page
 * @param {number} [timeout=5000] - How long to wait for the popup
 */
export async function dismissPopup(page, timeout = 5000) {
    try {
        await page.getByRole('button', { name: 'close' }).click({ timeout });
    } catch (e) {
        // No popup to dismiss
    }
}

/**
 * Navigates to the EFNS dashboard and handles initial modals
 * @param {import('playwright').Page} page
 */
export async function navigateToDashboard(page) {
    console.log('🌐 [STEP] Navigating to dashboard...');
    await page.goto('https://fns.immigration.go.ke/dash/dash.php');
    try {
        await page.locator('div.jconfirm button, button:has-text("CLOSE"), .jconfirm-buttons button').first().click({ timeout: 5000 });
    } catch (e) {
        // No notification modal
    }
}

/**
 * Handles downloading a file from URL (if needed) and uploading it to a form input
 * @param {import('playwright').Page} page
 * @param {string} fileInputSelector - CSS selector for the file input
 * @param {string} filePath - Local path or URL to the file
 * @param {string} docType - Label for logging
 * @param {string} [submitButtonSelector] - Optional button to click after upload
 */
export async function handleDocumentUpload(page, fileInputSelector, filePath, docType, submitButtonSelector) {
    let tempFilePath = null;
    try {
        console.log(`   📂 [DOC] Processing ${docType} document upload...`);

        if (filePath && filePath.startsWith('http')) {
            const fileExt = path.extname(filePath.split('?')[0]) || '.jpg';
            tempFilePath = path.join(__dirname, `temp_${docType}_${Date.now()}${fileExt}`);
            console.log(`   ↓↓ Downloading ${docType} document from: ${filePath}`);
            await downloadImage(filePath, tempFilePath);
            console.log(`   ↑↑ Uploading ${docType} document...`);
            await page.locator(fileInputSelector).setInputFiles(tempFilePath);
        } else if (filePath && fs.existsSync(filePath)) {
            console.log(`   ↑↑ Uploading local ${docType} document: ${filePath}`);
            await page.locator(fileInputSelector).setInputFiles(filePath);
        } else {
            console.warn(`   ⚠️ No valid file provided for ${docType}, skipping upload`);
            return;
        }

        if (submitButtonSelector) {
            console.log(`   💾 [DOC] Saving ${docType} details...`);
            await page.click(submitButtonSelector);
            await wait(1);
            console.log(`   ✅ [DOC] ${docType} saved successfully.`);
        }
    } catch (error) {
        console.error(`   ❌ Error processing ${docType} document:`, error.message);
        throw error;
    } finally {
        if (tempFilePath) safeRemoveFile(tempFilePath);
    }
}