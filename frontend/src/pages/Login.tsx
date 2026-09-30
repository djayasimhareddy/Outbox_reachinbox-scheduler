import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../lib/api';

const GOOGLE_LOGO = (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

const Login: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!loading && user) navigate('/scheduled', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'auth_failed') setErrorMsg('Google sign-in failed. Please try again.');
  }, [searchParams]);

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#F0F2F0] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-10 w-full max-w-md shadow-sm border border-gray-100">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-0.5">
            {['O', 'N', 'B'].map((letter) => (
              <div
                key={letter}
                className="w-9 h-9 border-2 border-gray-900 flex items-center justify-center rounded-sm"
              >
                <span className="font-bold text-base text-gray-900">{letter}</span>
              </div>
            ))}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-7 text-gray-900">Login</h1>

        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
            {errorMsg}
          </div>
        )}

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-[#EDF4EF] text-gray-700 py-3 rounded-xl hover:bg-green-50 hover:border-green-200 transition-all border border-[#D8EADc] mb-5 font-medium text-sm"
        >
          {GOOGLE_LOGO}
          Login with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">or sign up through email</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Email / Password (Visual only, redirects to OAuth) */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email ID"
            className="input-field"
          />
          <input
            type="password"
            placeholder="Password"
            className="input-field"
          />
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-[#3FA253] text-white py-3 rounded-xl font-medium hover:bg-green-600 transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
