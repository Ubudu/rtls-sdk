# Appendix C: Reference Publisher Implementation

Key patterns from the reference `UbuduWebsocketPublisher.js`:

```javascript
// Position message format expected by RTLS server
buildTrajectDataObject(macAddress, model, latitude, longitude, additionalData = {}, appNamespace, mapUuid, deviceInfo, origin = 4, userName, color) {
  // Format MAC address: lowercase, no colons
  const formattedMac = macAddress.toLowerCase().replace(/:/g, '');

  const deviceInfoDefault = {
    model: 'GNSS',
    system_build_number: '1.0',
    system_name: 'GenericTracker',
    system_version: '1.0',
  };

  return {
    app_namespace: appNamespace || this.config.appNamespace,
    device_info: deviceInfo || deviceInfoDefault,
    data: additionalData,
    lat: latitude,
    lon: longitude,
    map_uuid: mapUuid || this.config.mapUuid,
    model: model || 'GenericTag',
    origin: origin, // 4 = external system
    timestamp: new Date().toISOString(),
    user_name: userName || macAddress,
    user_uuid: formattedMac,
    color: color || '#0088FF',
  };
}
```

## Key Implementation Notes

1. **MAC Address Formatting**: Always normalize to lowercase without colons
2. **Origin Field**: Use `4` for external systems publishing positions
3. **Required Fields**: `app_namespace`, `lat`, `lon`, `map_uuid`, `user_uuid`
4. **Timestamp Format**: ISO 8601 string
5. **Device Info**: Provide default values if not specified
