"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";

interface HeaderProps {
  authLoading: boolean;
  currentUser: any; // replace with proper type if you have it
  userRole?: "admin" | "superadmin" | "user";
  companyName: string;
  setCompanyName: (val: string) => void;
  companyContext: string;
  setCompanyContext: (val: string) => void;
  handleUpdateCompany: () => void;
}

export default function Header({
  authLoading,
  currentUser,
  userRole,
  companyName,
  setCompanyName,
  companyContext,
  setCompanyContext,
  handleUpdateCompany,
}: HeaderProps) {
  const [showContext, setShowContext] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <>
      {/* Top Header */}
      <div className="p-5 text-lg font-semibold flex justify-between items-center bg-gradient-to-r from-gray-700 via-gray-800 to-gray-900 text-gray-200 shadow-md border-b border-gray-600">
        <div
          className="flex items-center cursor-pointer select-none"
          onClick={() => window.location.reload()}
          title="Reload page"
        >
          <div className="text-xl font-extrabold tracking-wide">
            RedHavana <span className="text-gray-400 font-normal">Voice Agent</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Context toggle */}
          <button
            onClick={() => setShowContext((prev) => !prev)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 transition-colors duration-300 text-sm font-semibold"
            title="Toggle Context"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transform transition-transform duration-300 ${
                showContext ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Context
          </button>

          {/* Avatar / Dropdown */}
          {authLoading ? (
            <div className="w-10 h-10 bg-gray-600 rounded-full animate-pulse" />
          ) : currentUser ? (
            <div className="relative block">
              <button
                className="rounded-full overflow-hidden border-2 border-gray-400 hover:ring-4 hover:ring-gray-500 transition-shadow"
                onClick={() => setShowDropdown((prev) => !prev)}
                aria-label="User menu"
              >
                {currentUser.photoURL ? (
                  <Image
                    src={currentUser.photoURL}
                    alt="avatar"
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold uppercase">
                    {currentUser.email?.charAt(0) || "U"}
                  </div>
                )}
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-100 rounded-lg shadow-lg py-2 border z-50 text-gray-700">
                  <Link href="/chat-history" className="block px-4 py-2 hover:bg-gray-200">
                    Previous Chats
                  </Link>
                  {userRole === "admin" && (
                    <Link href="/dashboard/admin" className="block px-4 py-2 hover:bg-gray-200">
                      Admin Dashboard
                    </Link>
                  )}
                  {userRole === "superadmin" && (
                    <Link href="/dashboard/superadmin" className="block px-4 py-2 hover:bg-gray-200">
                      Superadmin Dashboard
                    </Link>
                  )}
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-200 text-red-600"
                    onClick={() => signOut(auth)}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login">
              <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white font-semibold shadow-md transition-colors duration-300">
                Login
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* Context Section */}
      <div
        className={`overflow-hidden transition-[max-height,padding] duration-500 ${
          showContext ? "max-h-[500px] py-4" : "max-h-0 py-0"
        } bg-gray-100 rounded-b-lg shadow-inner`}
      >
        <div className="flex flex-wrap gap-4 items-end justify-center">
          <div className="flex flex-col gap-1 items-start">
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter your company name"
              className="border border-gray-300 rounded px-3 py-2 w-60 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <div className="flex flex-col gap-1 items-start">
            <label className="block text-sm font-medium text-gray-700">Company Context</label>
            <input
              type="text"
              value={companyContext}
              onChange={(e) => setCompanyContext(e.target.value)}
              placeholder="Brief description of your business"
              className="border border-gray-300 rounded px-3 py-2 w-80 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <button
            onClick={handleUpdateCompany}
            disabled={!companyName.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md transition-colors duration-300"
          >
            Update Agent
          </button>
        </div>
      </div>
    </>
  );
}
