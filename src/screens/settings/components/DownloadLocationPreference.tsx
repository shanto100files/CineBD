import React, {useState, useEffect} from 'react';
import {ToastAndroid, View, Platform} from 'react-native';
import {
  getDownloadLocationDisplayValue,
  selectDownloadLocation,
} from '../../../lib/downloadLocation';
import {settingsStorage} from '../../../lib/storage';
import {syncFromSharedFolder} from '../../../lib/sync/syncService';
import IconButton from '../../../components/ui/IconButton';
import SettingsRow from '../../../components/ui/SettingsRow';
import SettingsSection from '../../../components/ui/SettingsSection';
import AppText from '../../../components/ui/Text';
import DownloadLocationDialog from '../../../components/DownloadLocationDialog';

type DownloadLocationPreferenceProps = {
  primary: string;
};

const DownloadLocationPreference = ({
  primary,
}: DownloadLocationPreferenceProps) => {
  const [downloadLocation, setDownloadLocation] = useState(
    settingsStorage.getDownloadLocation(),
  );
  const [showDialog, setShowDialog] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  // Auto-set default if none configured
  useEffect(() => {
    const config = settingsStorage.getDownloadLocationConfig();
    if (!config) {
      ToastAndroid.show(
        'Please select Downloads folder to enable downloads',
        ToastAndroid.SHORT,
      );
    }
  }, []);

  const saveDownloadLocation = (
    location: NonNullable<
      ReturnType<typeof settingsStorage.getDownloadLocationConfig>
    >,
  ) => {
    settingsStorage.setDownloadLocation(location);
    setDownloadLocation(getDownloadLocationDisplayValue(location));
    syncFromSharedFolder().catch(e =>
      console.warn('[CinepixSync] Folder change sync failed:', e),
    );
    ToastAndroid.show('Download location updated', ToastAndroid.SHORT);
  };

  const pickDownloadLocation = async () => {
    setShowDialog(true);
  };

  const handleSelectFolder = async () => {
    setIsPickingFolder(true);
    setShowDialog(false);
    try {
      const pickedLocation = await selectDownloadLocation();
      if (pickedLocation) {
        saveDownloadLocation(pickedLocation);
        return;
      }
      ToastAndroid.show('No folder selected', ToastAndroid.SHORT);
    } catch (error) {
      console.log('Error picking download folder:', error);
      ToastAndroid.show('Unable to open folder picker', ToastAndroid.SHORT);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const resetDownloadLocation = () => {
    settingsStorage.resetDownloadLocation();
    setDownloadLocation('Select a download folder');
    ToastAndroid.show('Download location cleared', ToastAndroid.SHORT);
  };

  return (
    <View className="mb-6">
      <SettingsSection title="Downloads">
        <SettingsRow
          title="Download location"
          description={downloadLocation}
          divider
          trailing={
            <IconButton
              icon="folder-open-outline"
              label="Choose download location"
              disabled={isPickingFolder}
              onPress={pickDownloadLocation}
            />
          }
        />
        <View style={{paddingLeft: 16, paddingRight: 16, marginBottom: 8}}>
          <AppText
            role="bodySmall"
            style={{color: '#888', fontSize: 12, lineHeight: 16}}>
            {Platform.OS === 'android'
              ? '📁 Select "Downloads" folder and tap "Use this folder" button'
              : 'Choose the folder where downloads will be saved'}
          </AppText>
        </View>
        <SettingsRow
          title="Reset download location"
          description="Choose a folder again on the next download"
          divider={false}
          trailing={
            <IconButton
              icon="restore"
              label="Reset download location"
              onPress={resetDownloadLocation}
            />
          }
        />
      </SettingsSection>

      <DownloadLocationDialog
        visible={showDialog}
        primary={primary}
        selecting={isPickingFolder}
        onCancel={() => setShowDialog(false)}
        onSelectFolder={handleSelectFolder}
      />
    </View>
  );
};

export default DownloadLocationPreference;
