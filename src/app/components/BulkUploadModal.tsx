// import React, { useState } from "react";
// import BulkUploadNumbers from "./BulkUploadNumbers";
// interface BulkUploadModalProps {
//     onCall: (number: string, customerName?: string, customerEmail?: string) => Promise<string>; 
// }

// export default function BulkUploadModal({ onCall }: BulkUploadModalProps) {
//     const [isOpen, setIsOpen] = useState(false);

//     return (
//         <>
//             <button
//                 onClick={() => setIsOpen(true)}
//                 className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 transition-colors duration-300 text-sm font-semibold"
//             >
//                 📞 Bulk Upload Numbers
//             </button>

//             {isOpen && (
//                 <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
//                     <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg relative">
//                         <button
//                             onClick={() => setIsOpen(false)}
//                             className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
//                         >
//                             ✖
//                         </button>

//                         <h2 className="text-2xl font-semibold mb-4 text-black">Bulk Upload Phone Numbers</h2>

//                         <BulkUploadNumbers onClose={() => setIsOpen(false)} onCall={onCall} />
//                     </div>
//                 </div>
//             )}
//         </>
//     );
// }
import React, { useState, useEffect } from "react";
import BulkUploadNumbers from "./BulkUploadNumbers";

interface BulkUploadModalProps {
    onCall: (number: string, customerName?: string, customerEmail?: string) => Promise<string>; 
}

interface CallStats {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
    successRate: number;
    averageCallTime: number;
}

export default function BulkUploadModal({ onCall }: BulkUploadModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [callStats, setCallStats] = useState<CallStats>({
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        pending: 0,
        successRate: 0,
        averageCallTime: 0
    });
    const [isTracking, setIsTracking] = useState(false);

    const downloadTemplate = () => {
        const csvContent = "phoneNumber,customerName,customerEmail\n+1234567890,John Doe,john@example.com\n+0987654321,Jane Smith,jane@example.com";
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'contacts_template.csv';
        link.click();
        window.URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (isOpen) {
            const handleStatsUpdate = (event: CustomEvent) => {
                setCallStats(event.detail);
                setIsTracking(event.detail.inProgress > 0);
            };

            window.addEventListener('callStatsUpdate' as any, handleStatsUpdate);
            return () => window.removeEventListener('callStatsUpdate' as any, handleStatsUpdate);
        }
    }, [isOpen]);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-500 transition-colors duration-300 text-sm font-semibold shadow-md relative"
            >
                📞 Bulk Upload
                {isTracking && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-fadeIn">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors text-2xl font-bold"
                            title="Close"
                        >
                            ✖
                        </button>

                        <div className="flex items-center justify-between mb-6 ">
                            <h2 className="text-2xl font-bold text-gray-800">📞 Bulk Contact Manager</h2>
                            
                            <div className="flex gap-2 mr-4 ">
                                <button
                                    onClick={downloadTemplate}
                                    className="text-sm px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1"
                                    title="Download CSV template"
                                >
                                    ⬇️ Template
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAnalytics(false);
                                        setShowTutorial(!showTutorial);
                                    }}
                                    className="text-sm px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1"
                                >
                                    {showTutorial ? '📋 Upload' : '❓ Help'}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowTutorial(false);
                                        setShowAnalytics(!showAnalytics);
                                    }}
                                    className="text-sm px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors flex items-center gap-1"
                                >
                                    {showAnalytics ? '📋 Upload' : '📊 Analytics'}
                                </button>
                            </div>
                        </div>

                        {/* Progress Tracker */}
                        {isTracking && !showTutorial && !showAnalytics && (
                            <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-700">📊 Call Progress</h3>
                                    <span className="text-xs text-gray-500">
                                        {callStats.completed + callStats.failed} / {callStats.total} completed
                                    </span>
                                </div>
                                
                                <div className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                                        style={{ 
                                            width: `${callStats.total > 0 ? ((callStats.completed + callStats.failed) / callStats.total) * 100 : 0}%` 
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 animate-shimmer"></div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-3 text-center">
                                    <div className="bg-white rounded-lg p-2 shadow-sm">
                                        <div className="text-xs text-gray-500">In Progress</div>
                                        <div className="text-lg font-bold text-blue-600">{callStats.inProgress}</div>
                                    </div>
                                    <div className="bg-white rounded-lg p-2 shadow-sm">
                                        <div className="text-xs text-gray-500">Completed</div>
                                        <div className="text-lg font-bold text-green-600">{callStats.completed}</div>
                                    </div>
                                    <div className="bg-white rounded-lg p-2 shadow-sm">
                                        <div className="text-xs text-gray-500">Failed</div>
                                        <div className="text-lg font-bold text-red-600">{callStats.failed}</div>
                                    </div>
                                    <div className="bg-white rounded-lg p-2 shadow-sm">
                                        <div className="text-xs text-gray-500">Success Rate</div>
                                        <div className="text-lg font-bold text-purple-600">
                                            {callStats.successRate.toFixed(0)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showAnalytics ? (
                            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
                                <h3 className="text-xl font-bold text-gray-800 mb-6">📊 Call Analytics Dashboard</h3>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-white rounded-xl p-4 shadow-md border-l-4 border-blue-500">
                                        <div className="text-sm text-gray-500 mb-1">Total Calls</div>
                                        <div className="text-3xl font-bold text-gray-800">{callStats.total}</div>
                                    </div>
                                    <div className="bg-white rounded-xl p-4 shadow-md border-l-4 border-green-500">
                                        <div className="text-sm text-gray-500 mb-1">✅ Completed</div>
                                        <div className="text-3xl font-bold text-green-600">{callStats.completed}</div>
                                    </div>
                                    <div className="bg-white rounded-xl p-4 shadow-md border-l-4 border-red-500">
                                        <div className="text-sm text-gray-500 mb-1">❌ Failed</div>
                                        <div className="text-3xl font-bold text-red-600">{callStats.failed}</div>
                                    </div>
                                    <div className="bg-white rounded-xl p-4 shadow-md border-l-4 border-purple-500">
                                        <div className="text-sm text-gray-500 mb-1">⏳ Pending</div>
                                        <div className="text-3xl font-bold text-purple-600">{callStats.pending}</div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl p-6 shadow-md mb-6">
                                    <h4 className="font-semibold text-gray-800 mb-4">Success Rate</h4>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                                                <div 
                                                    className="bg-gradient-to-r from-green-400 to-green-600 h-8 rounded-full flex items-center justify-end px-3 transition-all duration-500"
                                                    style={{ width: `${callStats.successRate}%` }}
                                                >
                                                    <span className="text-white font-bold text-sm">
                                                        {callStats.successRate > 10 && `${callStats.successRate.toFixed(1)}%`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-3xl font-bold text-gray-800">
                                            {callStats.successRate.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white rounded-xl p-5 shadow-md">
                                        <h4 className="font-semibold text-gray-800 mb-3">📈 Call Status Breakdown</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">Completed</span>
                                                <span className="font-semibold text-green-600">{callStats.completed}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">Failed</span>
                                                <span className="font-semibold text-red-600">{callStats.failed}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">In Progress</span>
                                                <span className="font-semibold text-blue-600">{callStats.inProgress}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-gray-600">Pending</span>
                                                <span className="font-semibold text-purple-600">{callStats.pending}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-xl p-5 shadow-md">
                                        <h4 className="font-semibold text-gray-800 mb-3">⏱️ Performance Metrics</h4>
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-sm text-gray-600 mb-1">Avg Call Duration</div>
                                                <div className="text-2xl font-bold text-gray-800">
                                                    {callStats.averageCallTime > 0 
                                                        ? `${callStats.averageCallTime.toFixed(0)}s` 
                                                        : 'N/A'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-600 mb-1">Total Attempts</div>
                                                <div className="text-2xl font-bold text-gray-800">
                                                    {callStats.completed + callStats.failed}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {callStats.total === 0 && (
                                    <div className="mt-6 text-center text-gray-500 py-8">
                                        <div className="text-6xl mb-3">📊</div>
                                        <p className="text-lg">No call data available yet</p>
                                        <p className="text-sm">Start making calls to see analytics</p>
                                    </div>
                                )}
                            </div>
                        ) : showTutorial ? (
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">📚 How to Use Bulk Upload</h3>
                                
                                <div className="space-y-4 text-sm text-gray-700">
                                    <div className="bg-white rounded-lg p-4 shadow-sm">
                                        <h4 className="font-semibold mb-2">1️⃣ Prepare Your Contacts</h4>
                                        <p className="mb-2">You can upload contacts in two ways:</p>
                                        <ul className="list-disc list-inside space-y-1 ml-2">
                                            <li><strong>CSV File:</strong> Upload a spreadsheet with columns: phoneNumber, customerName, customerEmail</li>
                                            <li><strong>Text Input:</strong> Paste contacts one per line: +1234567890, John Doe, john@example.com</li>
                                        </ul>
                                    </div>

                                    <div className="bg-white rounded-lg p-4 shadow-sm">
                                        <h4 className="font-semibold mb-2">2️⃣ Save to Call List</h4>
                                        <p>Click "💾 Save to Call List" to store contacts in your database for later use.</p>
                                    </div>

                                    <div className="bg-white rounded-lg p-4 shadow-sm">
                                        <h4 className="font-semibold mb-2">3️⃣ Make Bulk Calls</h4>
                                        <ul className="list-disc list-inside space-y-1 ml-2">
                                            <li>Select contacts using checkboxes</li>
                                            <li>Click "☑ Select All" to select everyone</li>
                                            <li>Click "📞 Call Selected" to start automated calls</li>
                                            <li>Watch real-time progress in the tracker above</li>
                                        </ul>
                                    </div>

                                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                                        <h4 className="font-semibold mb-2 text-yellow-800">⚠️ Important Tips</h4>
                                        <ul className="list-disc list-inside space-y-1 ml-2 text-yellow-700">
                                            <li>Ensure Company Name and Context are set before calling</li>
                                            <li>Phone numbers must include country code (e.g., +1 for US)</li>
                                            <li>Calls are made one at a time to ensure quality</li>
                                            <li>View detailed analytics in the Analytics tab</li>
                                        </ul>
                                    </div>

                                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                        <h4 className="font-semibold mb-2 text-green-800">✨ Pro Tips</h4>
                                        <ul className="list-disc list-inside space-y-1 ml-2 text-green-700">
                                            <li>Download the template to see the correct format</li>
                                            <li>Check Analytics to monitor your success rate</li>
                                            <li>Check the Call List page to view transcripts</li>
                                            <li>Progress tracker shows real-time call status</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <BulkUploadNumbers onClose={() => setIsOpen(false)} onCall={onCall} />
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.2s ease-out;
                }
                @keyframes shimmer {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(100%);
                    }
                }
                .animate-shimmer {
                    animation: shimmer 2s infinite;
                }
            `}</style>
        </>
    );
}