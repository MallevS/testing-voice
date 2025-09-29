"use client";

interface ModalProps {
  title?: string;
  message: string;
  onClose: () => void;
}

export default function Modal({ title, message, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        {title && <h2 className="text-xl font-semibold mb-4">{title}</h2>}
        <p className="mb-4 whitespace-pre-wrap">{message}</p>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          OK
        </button>
      </div>
    </div>
  );
}
