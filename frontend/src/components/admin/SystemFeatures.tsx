'use client';

import React, { useState } from 'react';
import { 
    Tag, 
    Bell, 
    Monitor, 
    Plus, 
    Trash2, 
    Settings, 
    Save, 
    CheckCircle2,
    Layout,
    Globe,
    Image as ImageIcon,
    Type
} from 'lucide-react';
import toast from 'react-hot-toast';


interface Coupon {
    id: string;
    code: string;
    discountPct?: number;
    discountAmt?: number;
    isActive: boolean;
}

interface Banner {
    id: string;
    title: string;
    imageUrl: string;
    isActive: boolean;
}

interface SystemFeaturesProps {
    coupons: Coupon[];
    banners: Banner[];
    notifications: any[];
}

export const SystemFeatures = ({ coupons: initialCoupons, banners: initialBanners, notifications: initialNotifications }: SystemFeaturesProps) => {
    const [activeSubTab, setActiveSubTab] = useState('Coupons');
    const [coupons, setCoupons] = useState(initialCoupons || []);
    const [banners, setBanners] = useState(initialBanners || []);

    const [isAddCouponOpen, setIsAddCouponOpen] = useState(false);
    const [newCoupon, setNewCoupon] = useState({ code: '', discountPct: 0, isActive: true });

    const handleAddCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCoupon)
            });
            if (res.ok) {
                const data = await res.json();
                setCoupons([data, ...coupons]);
                setIsAddCouponOpen(false);
                setNewCoupon({ code: '', discountPct: 0, isActive: true });
                toast.success('Coupon created successfully!');
            }
        } catch (error) {
            toast.error('Failed to create coupon');
        }
    };

    const handleToggleCoupon = async (id: string, active: boolean) => {
        try {
            const res = await fetch('/api/admin/coupons', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: active })
            });
            if (res.ok) {
                setCoupons(coupons.map(c => c.id === id ? { ...c, isActive: active } : c));
                toast.success(`Coupon ${active ? 'activated' : 'deactivated'}`);
            }
        } catch (error) {
            toast.error('Failed to update coupon');
        }
    };

    const handleDeleteCoupon = async (id: string) => {
        if (!confirm('Are you sure you want to delete this coupon?')) return;
        try {
            const res = await fetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setCoupons(coupons.filter(c => c.id !== id));
                toast.success('Coupon deleted');
            }
        } catch (error) {
            toast.error('Failed to delete coupon');
        }
    };

    const handleToggleBanner = async (id: string, active: boolean) => {
        try {
            const res = await fetch('/api/admin/banners', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: active })
            });
            if (res.ok) {
                setBanners(banners.map(b => b.id === id ? { ...b, isActive: active } : b));
                toast.success(`Banner ${active ? 'activated' : 'deactivated'}`);
            }
        } catch (error) {
            toast.error('Failed to update banner');
        }
    };

    const handleDeleteBanner = async (id: string) => {
        if (!confirm('Are you sure you want to delete this banner?')) return;
        try {
            const res = await fetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setBanners(banners.filter(b => b.id !== id));
                toast.success('Banner deleted');
            }
        } catch (error) {
            toast.error('Failed to delete banner');
        }
    };



    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">System Features</h2>
                    <p className="text-gray-500 font-medium text-sm">Control platform-wide promotions, communication, and website content.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    {['Coupons', 'Banners'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveSubTab(tab)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activeSubTab === tab 
                                ? 'bg-white text-indigo-600 shadow-sm' 
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {activeSubTab === 'Coupons' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-indigo-600" /> Active Promotions
                        </h3>
                        <button 
                            onClick={() => setIsAddCouponOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Create Coupon
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {coupons.map((coupon) => (
                            <div key={coupon.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4">
                                    <div className={`w-3 h-3 rounded-full ${coupon.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></div>
                                </div>
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Promo Code</p>
                                        <h4 className="text-xl font-black text-indigo-600 tracking-tighter">{coupon.code}</h4>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-gray-700">{coupon.discountPct ? `${coupon.discountPct}% OFF` : `₹${coupon.discountAmt} OFF`}</p>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleToggleCoupon(coupon.id, !coupon.isActive)}
                                                className={`p-2 rounded-lg border transition-all ${coupon.isActive ? 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100' : 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100'}`}
                                            >
                                                {coupon.isActive ? <Settings className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteCoupon(coupon.id)}
                                                className="p-2 bg-gray-50 border border-gray-100 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeSubTab === 'Banners' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                            <Monitor className="w-5 h-5 text-indigo-600" /> Platform Banners
                        </h3>
                        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Upload Banner
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {banners.map(banner => (
                            <div key={banner.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden group">
                                <div className="h-40 bg-gray-100 relative group-hover:scale-[1.02] transition-transform duration-500">
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                                        <ImageIcon className="w-12 h-12" />
                                    </div>
                                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full border border-gray-100 text-[10px] font-black text-indigo-600 uppercase tracking-widest shadow-sm">
                                        {banner.isActive ? 'Live' : 'Draft'}
                                    </div>
                                </div>
                                <div className="p-6 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-gray-900">{banner.title}</h4>
                                        <p className="text-xs text-gray-500 mt-1 font-medium">Link: /courses/class-12</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleToggleBanner(banner.id, !banner.isActive)}
                                            className="p-2.5 bg-gray-50 border border-gray-100 text-gray-600 hover:bg-white hover:text-indigo-600 rounded-xl transition-all shadow-sm"
                                        >
                                            <ImageIcon className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteBanner(banner.id)}
                                            className="p-2.5 bg-gray-50 border border-gray-100 text-gray-600 hover:bg-white hover:text-rose-600 rounded-xl transition-all shadow-sm"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
