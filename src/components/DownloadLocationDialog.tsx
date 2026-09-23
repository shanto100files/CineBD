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

১. নিচের "ফোল্ডার নির্বাচন করুন" বাটনে ট্যাপ করুন — "All files access" সেটিংস খুলবে
২. "Allow access to manage all files" টগলটি চালু করুন, তারপর ব্যাক করে অ্যাপে ফিরে আসুন

এরপর থেকে ডাউনলোড অটোমেটিক Download/CineBD ফোল্ডারে সেভ হবে — আর কোনো পিকার দেখতে হবে না।`}
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
