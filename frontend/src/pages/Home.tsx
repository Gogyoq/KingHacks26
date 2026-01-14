import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, Brain, TrendingUp, Sparkles, GraduationCap, ArrowRight, Check } from 'lucide-react';

const Home: React.FC = () => {
  const navigate = useNavigate();

  const openAuthModal = (mode: 'login' | 'register') => {
    window.dispatchEvent(new CustomEvent('openAuthModal', { detail: mode }));
  };

  const features = [
    {
      icon: <GraduationCap className="w-12 h-12 text-[#8B4F47]" />,
      title: 'Personalized Learning',
      desc: 'Learn at your own pace with personalized AI tutoring. Get hints, explore topics, and build confidence through interactive storytelling.',
    },
    {
      icon: <Users className="w-12 h-12 text-[#6B9FA3]" />,
      title: 'Teacher Tools',
      desc: 'Upload materials, track student progress, and customize AI instructions. Gain insights into learning patterns and engagement.',
    },
    {
      icon: <Brain className="w-12 h-12 text-[#8B9D83]" />,
      title: 'AI-Powered Tutoring',
      desc: 'Intelligent tutoring adapts to each student\'s needs. Real-time feedback, contextual hints, and guided problem-solving.',
    },
  ];

  const benefits = [
    'Interactive storytelling makes learning engaging',
    'Real-time progress tracking for teachers',
    'Adaptive difficulty based on student performance',
    'Safe, focused learning environment',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F1E8] to-[#E8DFD0]">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img 
              src="/logo.png" 
              alt="Storyteller AI Logo" 
              className="w-32 h-32 rounded-3xl shadow-2xl border-4 border-white"
            />
          </div>

          {/* Hero Text */}
          <div className="mb-8">
            <h1 className="text-5xl md:text-6xl font-bold text-[#4A4A4A] mb-4 flex items-center justify-center gap-3">
              <BookOpen className="w-12 h-12 text-[#8B4F47]" />
              Storyteller AI
            </h1>
            <p className="text-xl md:text-2xl text-[#4A4A4A]/80 max-w-3xl mx-auto leading-relaxed">
              Step into a quiet digital library where learning comes alive through conversation. 
              Our AI tutor guides students through personalized lessons, creating a peaceful space for growth and discovery.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <button
              onClick={() => openAuthModal('register')}
              className="group px-8 py-4 bg-[#8B4F47] text-white font-bold rounded-2xl hover:bg-[#A0605A] transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Start Learning
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => openAuthModal('login')}
              className="px-8 py-4 bg-white text-[#8B4F47] font-bold rounded-2xl hover:bg-[#8B9D83]/10 transition-all duration-300 shadow-lg hover:shadow-xl border-2 border-[#8B4F47]/20"
            >
              Sign In
            </button>
          </div>

          {/* Tagline */}
          <p className="text-[#4A4A4A]/60 italic flex items-center justify-center gap-2">
            <BookOpen className="w-5 h-5" />
            Experience education in a peaceful environment designed for focus and growth
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-[#8B9D83]/20 hover:shadow-2xl hover:scale-105 transition-all duration-300"
            >
              <div className="mb-4 flex justify-center">{feature.icon}</div>
              <h3 className="text-2xl font-bold text-[#4A4A4A] mb-3 text-center">
                {feature.title}
              </h3>
              <p className="text-[#4A4A4A]/70 text-center leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-[#8B9D83]/20">
          <h2 className="text-3xl font-bold text-[#4A4A4A] mb-6 text-center flex items-center justify-center gap-3">
            <TrendingUp className="w-8 h-8 text-[#6B9FA3]" />
            Why Choose Storyteller AI?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-4 bg-[#8B9D83]/5 rounded-xl"
              >
                <div className="flex-shrink-0">
                  <Check className="w-6 h-6 text-[#6B9FA3]" />
                </div>
                <p className="text-[#4A4A4A] font-medium">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="bg-gradient-to-r from-[#8B4F47] to-[#6B9FA3] rounded-2xl p-12 shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Sparkles className="w-8 h-8" />
            Ready to Begin Your Journey?
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Join students and teachers creating meaningful learning experiences with AI
          </p>
          <button
            onClick={() => openAuthModal('register')}
            className="group px-10 py-5 bg-white text-[#8B4F47] font-bold rounded-2xl hover:bg-[#F5F1E8] transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 text-lg flex items-center gap-2 mx-auto"
          >
            <GraduationCap className="w-6 h-6" />
            Get Started Free
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
