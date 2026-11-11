[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationTenantConfigPatch

# Type Alias: NotificationTenantConfigPatch

> **NotificationTenantConfigPatch** = `Partial`\<`Omit`\<[`NotificationTenantConfig`](../interfaces/NotificationTenantConfig.md), `"app_namespace"` \| `"updated_at"` \| `"_id"` \| `"__v"`\>\>

A top-level merge patch of the tenant configuration (a supplied channel object replaces the stored one).

## Remarks

Spec: `PUT /tenant-config` declares no request body.
