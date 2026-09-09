import React, {useState} from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';

interface AdBoxProps {
  url: string;
  height?: number;
}

const AdBox: React.FC<AdBoxProps> = ({url, height = 120}) => {
  const [loading, setLoading] = useState(true);

  if (!url) return null;

  return (
    <View style={[styles.container, {height}]}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#333" />
        </View>
      )}
      <WebView
        source={{uri: url}}
        style={[styles.webview, {height}]}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 8,
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  webview: {
    width: '100%',
    backgroundColor: '#000',
  },
});

export default React.memo(AdBox);
