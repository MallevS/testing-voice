import React, { useState } from "react";
import BulkUploadNumbers from "./BulkUploadNumbers";
interface BulkUploadModalProps {
    onCall: (number: string, customerName?: string, customerEmail?: string) => Promise<string>; 
}

export default function BulkUploadModal({ onCall }: BulkUploadModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 transition-colors duration-300 text-sm font-semibold"
            >
                📞 Bulk Upload Numbers
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg relative">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                        >
                            ✖
                        </button>

                        <h2 className="text-2xl font-semibold mb-4 text-black">Bulk Upload Phone Numbers</h2>

                        <BulkUploadNumbers onClose={() => setIsOpen(false)} onCall={onCall} />
                    </div>
                </div>
            )}
        </>
    );
}
