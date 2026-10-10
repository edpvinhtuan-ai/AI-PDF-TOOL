import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, AlertCircle } from 'lucide-react';

interface DropZoneProps {
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  title?: string;
  description?: string;
  accept?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  multiple = false,
  onFilesSelected,
  title = 'Chọn hoặc kéo thả tệp PDF vào đây',
  description = 'Hỗ trợ tệp tin định dạng .pdf không giới hạn số lượng trang',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const processFiles = (rawFiles: FileList | null) => {
    if (!rawFiles || rawFiles.length === 0) return;
    setErrorMsg(null);

    const pdfFiles: File[] = [];
    for (let i = 0; i < rawFiles.length; i++) {
      const file = rawFiles[i];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push(file);
      }
    }

    if (pdfFiles.length === 0) {
      setErrorMsg('Vui lòng chỉ chọn tệp định dạng PDF (.pdf)');
      return;
    }

    if (!multiple && pdfFiles.length > 1) {
      onFilesSelected([pdfFiles[0]]);
    } else {
      onFilesSelected(pdfFiles);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    // Reset so the user can re-upload the same file if desired
    if (e.target) e.target.value = '';
  };

  return (
    <div className="w-full">
      <div
        id="dropzone-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all ${
          isDragging
            ? 'border-red-500 bg-red-50/50 ring-4 ring-red-100'
            : 'border-stone-300 bg-stone-50/70 hover:border-red-400 hover:bg-stone-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-input-pdf"
          accept=".pdf,application/pdf"
          multiple={multiple}
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div className="max-w-md space-y-1">
            <h3 className="text-base sm:text-lg font-semibold text-stone-900">{title}</h3>
            <p className="text-sm text-stone-500">{description}</p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              id="btn-choose-pdf-files"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              {multiple ? 'Chọn các tệp PDF từ máy tính' : 'Chọn tệp PDF từ máy tính'}
            </button>
          </div>
        </div>

        {isDragging && (
          <div className="absolute inset-0 bg-red-50/90 rounded-2xl flex items-center justify-center pointer-events-none">
            <p className="text-red-700 font-semibold text-base">Thả tệp PDF vào đây ngay bây giờ</p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
