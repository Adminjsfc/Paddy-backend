-- Copy timing/limit semantics from the reference GpsService master by alert code, not numeric ID.
UPDATE gps_alert_master SET alert_time=3,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='LH';
UPDATE gps_alert_master SET alert_time=30,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='DO';
UPDATE gps_alert_master SET alert_time=200,alert_reminder_time=500,alert_interval=1000 WHERE alert_short_name='OR';
UPDATE gps_alert_master SET alert_time=50,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='OS';
UPDATE gps_alert_master SET alert_time=10,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='SFN';
UPDATE gps_alert_master SET alert_time=1440,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='DISC';
UPDATE gps_alert_master SET alert_time=10,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='IDL';
UPDATE gps_alert_master SET alert_time=NULL,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='IGN_OFF';
UPDATE gps_alert_master SET alert_time=NULL,alert_reminder_time=5,alert_interval=NULL WHERE alert_short_name='IGN_ON';
UPDATE gps_alert_master SET alert_time=NULL,alert_reminder_time=NULL,alert_interval=NULL WHERE alert_short_name='ONL';
