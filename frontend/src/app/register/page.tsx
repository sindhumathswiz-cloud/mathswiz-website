'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, Phone, Loader2, ArrowRight, BookOpen, Users, GraduationCap, ChevronLeft, Lock } from 'lucide-react';
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({ subsets: ['latin'], weight: '800' });

type Role = 'STUDENT' | 'PARENT' | 'TEACHER' | null;

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedRole, setSelectedRole] = useState<Role>(null);

    // Form fields
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [mobile, setMobile] = useState('');
    const [studentClass, setStudentClass] = useState('');
    const [childName, setChildName] = useState('');
    const [childMobile, setChildMobile] = useState('');
    const [subjectExpertise, setSubjectExpertise] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // ADMIN CREATION STRATEGY COMMENT
    // Admin users will ONLY be created manually via the Supabase database interface 
    // or a secure backend seed script. No public endpoint should create an Admin role.

    const handleRoleSelect = (role: Role) => {
        setSelectedRole(role);
        setStep(2);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const payload = { 
            role: selectedRole, 
            firstName, 
            lastName, 
            password, 
            mobileNumber: mobile, 
            phone: mobile, // Task 1: Phone field
            class: studentClass, // Correct field name for API
            childName, 
            childMobile, 
            subjectExpertise 
        };

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setSuccess(true);
                setTimeout(() => {
                    router.push('/login');
                }, 2000);
            } else {
                const data = await res.json();
                alert(data.message || 'Registration failed');
            }
        } catch (err) {
            alert('Registration failed. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center mb-6">
                    <Image src="/logo.png" alt="Logo" width={60} height={60} className="rounded-xl shadow-md" />
                </div>
                <h2 className={`mt-2 text-center text-3xl font-extrabold text-gray-900 ${montserrat.className}`}>
                    {step === 1 ? 'Choose your account type' : 'Complete your profile'}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
                        Sign in here
                    </Link>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    {success ? (
                        <div className="text-center py-8">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                                <CheckIcon className="h-6 w-6 text-green-600" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">Registration Successful!</h3>
                            <p className="mt-2 text-sm text-gray-500">Redirecting to login...</p>
                        </div>
                    ) : step === 1 ? (
                        <div className="space-y-4">
                            <button
                                onClick={() => handleRoleSelect('STUDENT')}
                                className="w-full flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition group text-left"
                            >
                                <div className="bg-indigo-100 p-3 rounded-lg group-hover:bg-indigo-200 transition">
                                    <GraduationCap className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-semibold text-gray-900">I am a Student</h3>
                                    <p className="text-sm text-gray-500">Access study materials and join batches.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => handleRoleSelect('PARENT')}
                                className="w-full flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-600 hover:bg-emerald-50 transition group text-left"
                            >
                                <div className="bg-emerald-100 p-3 rounded-lg group-hover:bg-emerald-200 transition">
                                    <Users className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-semibold text-gray-900">I am a Parent</h3>
                                    <p className="text-sm text-gray-500">Track your child's performance and fees.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => handleRoleSelect('TEACHER')}
                                className="w-full flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-amber-600 hover:bg-amber-50 transition group text-left"
                            >
                                <div className="bg-amber-100 p-3 rounded-lg group-hover:bg-amber-200 transition">
                                    <BookOpen className="w-6 h-6 text-amber-600" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-semibold text-gray-900">I am a Teacher</h3>
                                    <p className="text-sm text-gray-500">Manage batches and upload resources.</p>
                                </div>
                            </button>

                            <div className="relative my-8">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                                    <span className="px-3 bg-white text-gray-400">Faster Option</span>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    const { signIn } = require('next-auth/react');
                                    signIn('azure-ad');
                                }}
                                className="w-full flex items-center justify-center p-4 border-2 border-indigo-600 bg-indigo-50/50 rounded-xl hover:bg-indigo-600 hover:text-white transition group text-center gap-3 shadow-sm"
                            >
                                <svg className="w-6 h-6" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                                </svg>
                                <div>
                                    <h3 className="text-lg font-bold">Sign up with Microsoft</h3>
                                    <p className="text-xs opacity-70">Auto-creates student account & syncs profile</p>
                                </div>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="text-sm text-gray-500 hover:text-gray-900 flex items-center mb-4"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Back
                            </button>

                            {/* Global Fields */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">First Name</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-lg py-3 bg-gray-50 border outline-none"
                                        placeholder="John"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-lg py-3 bg-gray-50 border outline-none"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Mobile Number</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Phone className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text" required value={mobile} onChange={(e) => setMobile(e.target.value)}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-lg py-3 bg-gray-50 border outline-none"
                                        placeholder="Enter mobile number"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password</label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-lg py-3 bg-gray-50 border outline-none"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Conditional Fields based on Role */}
                            {selectedRole === 'STUDENT' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Class/Grade</label>
                                    <select required value={studentClass} onChange={(e) => setStudentClass(e.target.value)}
                                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-lg py-3 px-4 bg-gray-50 border outline-none appearance-none"
                                    >
                                        <option value="" disabled>Select a class</option>
                                        <option value="Class 11">Class 11</option>
                                        <option value="Class 12">Class 12</option>
                                        <option value="NDA">NDA</option>
                                        <option value="CUET">CUET</option>
                                        <option value="Foundation">Foundation</option>
                                    </select>
                                </div>
                            )}

                            {selectedRole === 'PARENT' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Child's Name</label>
                                        <input type="text" required value={childName} onChange={(e) => setChildName(e.target.value)}
                                            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-lg py-3 px-4 bg-gray-50 border outline-none"
                                            placeholder="John Doe Jr." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Child's Mobile Number (Optional)</label>
                                        <input type="text" value={childMobile} onChange={(e) => setChildMobile(e.target.value)}
                                            className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-lg py-3 px-4 bg-gray-50 border outline-none"
                                            placeholder="Enter child's mobile" />
                                    </div>
                                </>
                            )}

                            {selectedRole === 'TEACHER' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Subject Expertise</label>
                                    <input type="text" required value={subjectExpertise} onChange={(e) => setSubjectExpertise(e.target.value)}
                                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-lg py-3 px-4 bg-gray-50 border outline-none"
                                        placeholder="e.g. Advanced Calculus" />
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition items-center mt-6"
                            >
                                {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                    <>Create {selectedRole?.toLowerCase()} account <ArrowRight className="ml-2 w-4 h-4" /></>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

function CheckIcon(props: any) {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
    );
}
