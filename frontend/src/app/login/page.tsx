"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Lock, Phone, LogIn } from "lucide-react";

export default function Login() {
    const router = useRouter();

    const [mobile, setMobile] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [useOtp, setUseOtp] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const res = await signIn("credentials", {
                mobile,
                password: useOtp ? undefined : password,
                otp: useOtp ? otp : undefined,
                redirect: false,
            });

            if (res?.error) {
                console.error("Login error:", res.error);
                setError(res.error || "Invalid credentials. Please try again.");
            } else {
                // Get the updated session to check role
                const sessionRes = await fetch('/api/auth/session');
                const session = await sessionRes.json();
                console.log("Session after login:", session);
                const role = session?.user?.role;
                console.log("Role:", role);

                if (role === 'ADMIN') {
                    router.push("/admin/dashboard");
                } else if (role === 'TEACHER') {
                    router.push("/teacher/dashboard");
                } else {
                    router.push("/student/dashboard");
                }
            }
        } catch (err) {
            setError("An error occurred during login.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="bg-indigo-600 p-3 rounded-full shadow-lg">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Sign In
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Welcome back to Sindhu's Mathswiz Classes
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Mobile Number *</label>
                            <div className="mt-1 relative rounded-md shadow-sm flex items-center">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Phone className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="tel"
                                    required
                                    value={mobile}
                                    onChange={(e) => setMobile(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="10-digit number"
                                />
                            </div>
                        </div>

                        {useOtp ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">One-Time Password (OTP) *</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <input
                                        type="text"
                                        required
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Enter 1234 for testing"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password *</label>
                                <div className="mt-1 relative rounded-md shadow-sm flex items-center">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="text-sm">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUseOtp(!useOtp);
                                        setOtp("");
                                        setPassword("");
                                    }}
                                    className="font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    {useOtp ? "Use Password instead" : "Login with OTP instead"}
                                </button>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
                            >
                                {isLoading ? "Signing in..." : "Sign in"}
                            </button>
                        </div>

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500 font-medium">Or continue with</span>
                            </div>
                        </div>

                        <div>
                            <button
                                type="button"
                                onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
                                className="w-full flex justify-center items-center gap-3 py-2.5 px-4 border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                                </svg>
                                Sign in with Microsoft
                            </button>
                        </div>

                        <div className="text-sm text-center">
                            <span className="text-gray-600">Don't have an account? </span>
                            <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                                Register now
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
