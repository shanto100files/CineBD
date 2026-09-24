package com.cine.pix

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * One-tap READ_MEDIA_VIDEO runtime permission (Android 13+ system dialog with
 * "Allow limited / Allow all / Don't allow"). Used by the Downloads screen to
 * browse the device's own video files ("Local files" tab) — separate from the
 * All-files-access toggle that only governs where downloads are written.
 */
class ReadMediaVideoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ReadMediaVideoModule"

    @ReactMethod
    fun check(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext,
                    Manifest.permission.READ_MEDIA_VIDEO,
                ) == PackageManager.PERMISSION_GRANTED
                // READ_MEDIA_VISUAL_USER_SELECTED counts as partial grant.
                val partial = if (Build.VERSION.SDK_INT >= 34) {
                    ContextCompat.checkSelfPermission(
                        reactContext,
                        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
                    ) == PackageManager.PERMISSION_GRANTED
                } else false
                promise.resolve(granted || partial)
            } else {
                promise.resolve(true) // Android 12-: no runtime video permission needed
            }
        } catch (e: Exception) {
            promise.reject("CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun request(promise: Promise) {
        try {
            val activity = currentActivity
                ?: return promise.reject("NO_ACTIVITY", "Activity not available")

            if (Build.VERSION.SDK_INT >= 33) {
                val permissions = if (Build.VERSION.SDK_INT >= 34) {
                    arrayOf(
                        Manifest.permission.READ_MEDIA_VIDEO,
                        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
                    )
                } else {
                    arrayOf(Manifest.permission.READ_MEDIA_VIDEO)
                }
                activity.requestPermissions(permissions, 9201)
                promise.resolve(true)
            } else {
                promise.resolve(true) // Nothing to request on Android 12-
            }
        } catch (e: Exception) {
            promise.reject("REQUEST_FAILED", e.message, e)
        }
    }

    /** Device video library via MediaStore (newest first). */
    @ReactMethod
    fun listVideos(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                val granted = ContextCompat.checkSelfPermission(
                    reactContext,
                    Manifest.permission.READ_MEDIA_VIDEO,
                ) == PackageManager.PERMISSION_GRANTED
                val partial = if (Build.VERSION.SDK_INT >= 34) {
                    ContextCompat.checkSelfPermission(
                        reactContext,
                        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
                    ) == PackageManager.PERMISSION_GRANTED
                } else false
                if (!granted && !partial) {
                    promise.reject("NO_PERMISSION", "READ_MEDIA_VIDEO not granted")
                    return
                }
            }

            val collection: Uri = if (Build.VERSION.SDK_INT >= 29) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            } else {
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            }
            val projection = arrayOf(
                MediaStore.Video.Media._ID,
                MediaStore.Video.Media.DISPLAY_NAME,
                MediaStore.Video.Media.DURATION,
                MediaStore.Video.Media.SIZE,
                MediaStore.Video.Media.DATE_MODIFIED,
                MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            )
            val videos: WritableArray = Arguments.createArray()
            reactContext.contentResolver.query(
                collection,
                projection,
                null,
                null,
                "${MediaStore.Video.Media.DATE_MODIFIED} DESC",
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                val durCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                val folderCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val item = Arguments.createMap()
                    item.putString("uri", Uri.withAppendedPath(collection, "" + id).toString())
                    item.putString("name", cursor.getString(nameCol) ?: "")
                    item.putDouble("durationMs", cursor.getLong(durCol).toDouble())
                    item.putDouble("sizeBytes", cursor.getLong(sizeCol).toDouble())
                    item.putString("folder", cursor.getString(folderCol) ?: "")
                    videos.pushMap(item)
                }
            }
            promise.resolve(videos)
        } catch (e: Exception) {
            promise.reject("LIST_FAILED", e.message, e)
        }
    }
}
