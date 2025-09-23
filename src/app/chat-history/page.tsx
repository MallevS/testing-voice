"use client";
import React from "react";
import ChatHistory from "../components/ChatHistory";

export default function ChatHistoryPage() {
    return (
        <div className="min-h-screen bg-gray-100">
            <ChatHistory onClose={() => window.history.back()} />
        </div>
    );
}
