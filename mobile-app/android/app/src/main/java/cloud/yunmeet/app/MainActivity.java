package cloud.yunmeet.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERM_REQUEST_CODE = 4711;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // WebView 的 WebRTC 只在"安卓运行时权限已授予"时才放行 getUserMedia，
        // 但它自己不会拉起系统授权弹窗 —— 所以进 App 就先把权限要到手。
        ensureMediaPermissions();
    }

    private void ensureMediaPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return; // API 22 及以下安装时即授予权限
        }
        String[] wanted = new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO
        };
        boolean needAsk = false;
        boolean permanentlyDenied = false;
        for (String p : wanted) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needAsk = true;
                if (!ActivityCompat.shouldShowRequestPermissionRationale(this, p)) {
                    // 没弹过或被点了"不再询问"
                    permanentlyDenied = true;
                }
            }
        }
        if (!needAsk) {
            return;
        }
        if (permanentlyDenied && isDeniedBefore()) {
            // 曾经拒绝过且勾了"不再询问"：直接跳到本应用的系统设置页
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return;
        }
        ActivityCompat.requestPermissions(this, wanted, PERM_REQUEST_CODE);
    }

    private boolean isDeniedBefore() {
        return getSharedPreferences("perms", MODE_PRIVATE).getBoolean("asked", false);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERM_REQUEST_CODE) {
            getSharedPreferences("perms", MODE_PRIVATE).edit().putBoolean("asked", true).apply();
        }
    }
}
