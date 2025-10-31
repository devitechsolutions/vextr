import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, File, X } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  currentFile: File | null;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelect,
  acceptedTypes = '*',
  maxSizeMB = 5,
  currentFile
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };
  
  const validateAndProcessFile = (file: File) => {
    // Check file size
    if (file.size > maxSizeBytes) {
      toast({
        title: 'File too large',
        description: `Maximum file size is ${maxSizeMB}MB`,
        variant: 'destructive',
      });
      return;
    }
    
    // Check file type if specified
    if (acceptedTypes !== '*') {
      const fileType = file.type;
      const acceptedTypesArray = acceptedTypes.split(',');
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      let isAccepted = false;
      for (const type of acceptedTypesArray) {
        if (type.startsWith('.')) {
          // Check by extension
          if (fileExtension === type.toLowerCase()) {
            isAccepted = true;
            break;
          }
        } else {
          // Check by MIME type
          if (fileType.match(new RegExp(type.replace('*', '.*')))) {
            isAccepted = true;
            break;
          }
        }
      }
      
      if (!isAccepted) {
        toast({
          title: 'Invalid file type',
          description: `Accepted file types: ${acceptedTypes}`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    // Simulate upload process
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      onFileSelect(file);
    }, 1000);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };
  
  const handleRemoveFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileSelect(null as any);
  };
  
  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'csv':
        return <File className="h-6 w-6 text-green-600" />;
      case 'xls':
      case 'xlsx':
        return <File className="h-6 w-6 text-green-600" />;
      case 'json':
        return <File className="h-6 w-6 text-orange-600" />;
      default:
        return <File className="h-6 w-6 text-blue-600" />;
    }
  };
  
  return (
    <div className="w-full">
      {!currentFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? 'border-primary bg-primary/5' : 'border-gray-300'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <Upload className="h-10 w-10 text-muted-foreground" />
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Drag & drop your file here</h3>
              <p className="text-sm text-muted-foreground">
                or click to browse (max {maxSizeMB}MB)
              </p>
              {acceptedTypes !== '*' && (
                <p className="text-xs text-muted-foreground">
                  Accepted formats: {acceptedTypes}
                </p>
              )}
            </div>
            
            <Input
              ref={fileInputRef}
              type="file"
              accept={acceptedTypes}
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="relative"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Select File'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getFileIcon(currentFile.name)}
              <div>
                <p className="font-medium">{currentFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};