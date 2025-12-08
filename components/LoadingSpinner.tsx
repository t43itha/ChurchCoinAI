import React from "react";

interface LoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = "Loading...",
  size = "md",
}) => {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-3",
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center">
      <div
        className={`${sizeClasses[size]} border-slate-200 border-t-slate-800 rounded-full animate-spin`}
      />
      {message && (
        <p className="mt-4 text-slate-500 text-sm font-medium">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
