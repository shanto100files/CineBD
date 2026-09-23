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
      title="ডাউনলোড সেটআপ — এক ক্যাপে"
      message={`ডাউনলোড অটোমেটিক সেট করতে:

১. নিচের বাটনে ট্যাপ করুন — ফাইল-ম্যানেজার নয়, সরাসরি "All files access" সেটিংস খুলবে (Cinepix আগেই সিলেক্টেড থাকবে)
২. টগলটি ON করুন — ব্যাক করলেই অটোমেটিক Download/CineBD ফোল্ডার সেট হয়ে যাবে

এরপর আর কখনো কিছু চেখতে হবে না — সব ডাউনলোড নিজে নিজে গুছিয়ে সেভ হবে।`}
      primary=""
      actions={[
        {label: 'বাতিল'},
        {
          label: selecting ? 'খুলছে...' : 'সেটিংস খুলুন',
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
