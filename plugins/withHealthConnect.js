const { withAndroidManifest } = require('@expo/config-plugins');

const ALIAS_NAME = 'ViewPermissionUsageActivity';

const withHealthConnect = (config) => {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];

    if (!application['activity-alias']) {
      application['activity-alias'] = [];
    }

    const alreadyExists = application['activity-alias'].some(
      (alias) => alias.$?.['android:name'] === ALIAS_NAME
    );

    if (!alreadyExists) {
      application['activity-alias'].push({
        $: {
          'android:name': ALIAS_NAME,
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } },
            ],
            category: [
              { $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } },
            ],
          },
        ],
      });
    }

    return config;
  });
};

module.exports = withHealthConnect;
