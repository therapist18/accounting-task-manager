import { redirect } from "next/navigation";
import { getServerAppSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const session = await getServerAppSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-blue-300/20 to-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/4 w-60 h-60 bg-gradient-to-r from-white/10 to-blue-200/20 rounded-full blur-2xl animate-pulse delay-500"></div>
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-gradient-to-l from-blue-300/20 to-cyan-300/20 rounded-full blur-2xl animate-pulse delay-700"></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* Left Column - Brand & Features */}
          <div className="hidden lg:block space-y-8">
            {/* Logo and title */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur-sm px-6 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <span className="text-blue-900 font-semibold">Task Manager</span>
              </div>

              <div className="space-y-4">
                <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
                  Streamline Your Workflow
                </h1>
                <p className="text-xl text-gray-700">
                  The intelligent task management system designed for modern teams
                </p>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-white/80 to-blue-50/80 backdrop-blur-sm p-6 hover:scale-105 transition-all duration-300">
                <div className="relative z-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">Lightning Fast</h3>
                  <p className="text-gray-600 text-sm">Optimized performance for seamless task management</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-100/50 to-cyan-100/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-white/80 to-blue-50/80 backdrop-blur-sm p-6 hover:scale-105 transition-all duration-300">
                <div className="relative z-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">Secure</h3>
                  <p className="text-gray-600 text-sm">Enterprise-grade security for your data</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-100/50 to-blue-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-white/80 to-blue-50/80 backdrop-blur-sm p-6 hover:scale-105 transition-all duration-300">
                <div className="relative z-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">Analytics</h3>
                  <p className="text-gray-600 text-sm">Real-time insights and reporting</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-100/50 to-cyan-100/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-white/80 to-blue-50/80 backdrop-blur-sm p-6 hover:scale-105 transition-all duration-300">
                <div className="relative z-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-gray-900 font-semibold mb-2">Team Collaboration</h3>
                  <p className="text-gray-600 text-sm">Work together seamlessly</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-100/50 to-blue-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8 pt-8 border-t border-blue-200">
              <div>
                <div className="text-3xl font-bold text-gray-900">10K+</div>
                <div className="text-gray-600 text-sm">Active Users</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900">99.9%</div>
                <div className="text-gray-600 text-sm">Uptime</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900">24/7</div>
                <div className="text-gray-600 text-sm">Support</div>
              </div>
            </div>
          </div>

          {/* Right Column - Login Form */}
          <div className="w-full max-w-md mx-auto lg:max-w-none">
            <div className="bg-white/90 backdrop-blur-xl border border-blue-200 rounded-3xl p-8 shadow-2xl">
              {/* Mobile logo */}
              <div className="lg:hidden text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Task Manager</h1>
              </div>

              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
                <p className="text-gray-600">Sign in to access your workspace</p>
              </div>

              <LoginForm />

              {/* Footer links */}
              <div className="mt-8 pt-6 border-t border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-gray-600 text-sm">
                  &copy; 2024 Task Manager
                </div>
                <div className="flex gap-6">
                  <button className="text-gray-600 hover:text-gray-900 text-sm transition-colors">
                    Privacy
                  </button>
                  <button className="text-gray-600 hover:text-gray-900 text-sm transition-colors">
                    Terms
                  </button>
                  <button className="text-gray-600 hover:text-gray-900 text-sm transition-colors">
                    Support
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
