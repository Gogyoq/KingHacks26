import React from 'react';
import { BookOpen, Sparkles } from 'lucide-react';

interface LoadingAnimationProps {
    message?: string;
    subMessage?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
    message = "Preparing your lesson...",
    subMessage = "Getting everything ready for you"
}) => {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="relative mb-6">
                {/* Animated Background Blob */}
                <div className="absolute inset-0 bg-[#8B9D83]/20 rounded-full blur-xl animate-pulse"></div>

                {/* Bouncing Book Icon */}
                <div className="relative animate-bounce-gentle">
                    <div className="w-20 h-20 bg-gradient-to-br from-[#8B4F47] to-[#A0605A] rounded-2xl shadow-xl flex items-center justify-center transform rotate-3 border-2 border-white/20">
                        <BookOpen className="w-10 h-10 text-white animate-pulse" />
                    </div>
                    <div className="absolute -top-2 -right-2">
                        <Sparkles className="w-8 h-8 text-[#DAA520] animate-spin-slow" />
                    </div>
                </div>
            </div>

            <h3 className="text-xl font-bold text-[#4A4A4A] mb-2 font-serif">
                {message}
            </h3>
            <p className="text-[#4A4A4A]/60 text-sm max-w-xs mx-auto">
                {subMessage}
            </p>

            <style jsx>{`
        @keyframes bounce-gentle {
          0%, 100% { transform: translateY(0) rotate(3deg); }
          50% { transform: translateY(-10px) rotate(3deg); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-bounce-gentle {
          animation: bounce-gentle 3s infinite ease-in-out;
        }
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
        }
      `}</style>
        </div>
    );
};

export default LoadingAnimation;
