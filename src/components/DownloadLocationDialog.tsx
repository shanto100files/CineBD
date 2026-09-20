import React from 'react';
import AppDialog from './AppDialog';

interface DownloadLocationDialogProps {
  visible: boolean;
  primary: string;
  selecting: boolean;
  onCancel: () => void;
  onSelectFolder: () => void;
}

const DownloadLocationDialog = ({
  visible,
  selecting,
  onCancel,
  onSelectFolder,
}: DownloadLocationDialogProps) => {
  return (
    <AppDialog
      visible={visible}
      title="ডাউনলোড ফোল্ডার নির্বাচন করুন"
      message={`📁 ডাউনলোড ফোল্ডার সেট করার নিয়ম:

১. নিচের "ফোল্ডার নির্বাচন করুন" বাটনে ট্যাপ করুন
২. অ্যান্ড্রয়েড ফোল্ডার পিকার খুলবে
৩. "Downloads" ফোল্ডারে ট্যাপ করুন
৪. উপরে ডানদিকে "এই ফোল্ডারে ব্যবহার করুন" (Use this folder) বাটনে ট্যাপ করুন

এটি একবার মাত্র করতে হবে।`}
      primary=""
      actions={[
        {label: 'বাতিল'},
        {
          label: selecting ? 'খুলছে...' : 'ফোল্ডার নির্বাচন করুন',
          variant: 'primary',
          disabled: selecting,
          dismissOnPress: false,
          onPress: onSelectFolder,
        },
      ]}
      onDismiss={onCancel}
    />
  );
};

export default DownloadLocationDialog;
