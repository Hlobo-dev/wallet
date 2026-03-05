package com.kraken.superwallet.modules.activityLifecycle

import android.app.Activity
import android.app.Application
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule


class ActivityLifecycleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var isInitialized = false
    private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null

    override fun getName(): String {
        return "ActivityLifecycle"
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    @ReactMethod
    fun init() {
        if (isInitialized) {
            return
        }

        val application = getApplication() ?: return
        val callbacks = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityStarted(activity: Activity) {
                sendEvent("onActivityStarted")
            }
            override fun onActivityResumed(activity: Activity) {
                sendEvent("onActivityResumed")
            }
            override fun onActivityPaused(activity: Activity) {
                sendEvent("onActivityPaused")
            }
            override fun onActivityStopped(activity: Activity) {
                sendEvent("onActivityStopped")
            }
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        }

        application.registerActivityLifecycleCallbacks(callbacks)
        lifecycleCallbacks = callbacks
        isInitialized = true
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        lifecycleCallbacks?.let { callbacks ->
            getApplication()?.unregisterActivityLifecycleCallbacks(callbacks)
            lifecycleCallbacks = null
        }
        isInitialized = false
    }

    private fun sendEvent(eventName: String) {
        val context = reactApplicationContextIfActiveOrWarn ?: return
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, null)
    }

    private fun getApplication(): Application? {
        return reactApplicationContext.applicationContext as? Application
    }
}
