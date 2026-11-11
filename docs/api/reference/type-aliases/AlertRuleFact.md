[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleFact

# Type Alias: AlertRuleFact

> **AlertRuleFact** = `"user_name"` \| `"user_type"` \| `"user_tags"` \| `"user_udid"` \| `"external_id"` \| `"zone_count"` \| `"zone_id"` \| `"zone_name"` \| `"zone_tags"` \| `"time_in_zone"` \| `"enter_zone"` \| `"exit_zone"` \| `"position_cache_expired"` \| `"battery_percent"` \| `"TAG_DISAPPEARED"` \| `"TAG_APPEARED"` \| `"is_declared_position"` \| `"declaration_source"` \| `"declared_poi_name"` \| `"declared_poi_id"` \| `"declared_device_id"` \| `"declared_device_name"` \| `"declared_venue_id"` \| `"is_virtual"` \| `"app_namespace"` \| `"model"` \| `"color"` \| `"path"` \| `"visit_id"` \| `"start_ts"` \| `"exit_ts"` \| `"user_data"` \| `"zone_color"`

The facts a condition can read: the 24 facts of the rule editor and 9 more exposed by the engine. Every raw
position field is a fact too, so the condition type also accepts any string. Custom taxonomy fields are read with
`{ fact: 'user_data', path: '$.<field>' }`; a fact named `user_data.<field>` does not exist.
Not described by the spec (USI-P5-1).
