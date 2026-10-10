import React from 'react';
import { Minimize2, Scissors, Layers, ShieldCheck, FileType, FileSpreadsheet } from 'lucide-react';
import { ActiveTab } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between py-3.5 sm:py-4 gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
              <span className="text-base tracking-wider">PDF</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-stone-900 tracking-tight">PDF Tools Studio</h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Bảo mật 100%
                </span>
              </div>
              <p className="text-xs text-stone-500">Ghép nối • Cắt tách • Nén dung lượng • Chuyển sang Word &amp; Excel</p>
            </div>
          </div>

          {/* Local processing guarantee indicator */}
          <div className="hidden md:flex items-center gap-2 text-xs text-stone-600 bg-stone-50 px-3.5 py-2 rounded-xl border border-stone-200/80 shadow-2xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">Chạy Offline 100% • Dữ liệu an toàn</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-2 border-t border-stone-100 pt-2 pb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            id="tab-merge"
            onClick={() => onTabChange('merge')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              activeTab === 'merge'
                ? 'bg-red-50 text-red-700 font-bold shadow-xs border border-red-200'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Layers className={`w-4 h-4 ${activeTab === 'merge' ? 'text-red-600' : 'text-stone-500'}`} />
            <span>Nối PDF</span>
          </button>

          <button
            type="button"
            id="tab-split"
            onClick={() => onTabChange('split')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              activeTab === 'split'
                ? 'bg-red-50 text-red-700 font-bold shadow-xs border border-red-200'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Scissors className={`w-4 h-4 ${activeTab === 'split' ? 'text-red-600' : 'text-stone-500'}`} />
            <span>Cắt &amp; Tách PDF</span>
          </button>

          <button
            type="button"
            id="tab-compress"
            onClick={() => onTabChange('compress')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              activeTab === 'compress'
                ? 'bg-red-50 text-red-700 font-bold shadow-xs border border-red-200'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Minimize2 className={`w-4 h-4 ${activeTab === 'compress' ? 'text-red-600' : 'text-stone-500'}`} />
            <span>Nén PDF</span>
          </button>

          <button
            type="button"
            id="tab-to-word"
            onClick={() => onTabChange('to-word')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              activeTab === 'to-word'
                ? 'bg-blue-50 text-blue-800 font-bold shadow-xs border border-blue-200'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <FileType className={`w-4 h-4 ${activeTab === 'to-word' ? 'text-blue-600' : 'text-stone-500'}`} />
            <span>PDF sang Word</span>
          </button>

          <button
            type="button"
            id="tab-to-excel"
            onClick={() => onTabChange('to-excel')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0 ${
              activeTab === 'to-excel'
                ? 'bg-emerald-50 text-emerald-800 font-bold shadow-xs border border-emerald-200'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 ${activeTab === 'to-excel' ? 'text-emerald-600' : 'text-stone-500'}`} />
            <span>PDF sang Excel</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
