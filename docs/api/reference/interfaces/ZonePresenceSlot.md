[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZonePresenceSlot

# Interface: ZonePresenceSlot

One time slot of `zones.getPresence`. Hand-written: the spec declares no response schema. Occupied slot: the zone
of one position document of the slot plus `timestamp`. Empty slot: `{ id: 0, name: 'OUTSIDE_ALL_ZONES',
timestamp }`. Document without zone: `{ name: 'UNKNOWN_ZONE', timestamp }`.

## Properties

### id?

> `optional` **id?**: `number`

***

### name

> **name**: `string` & `object` \| `"OUTSIDE_ALL_ZONES"` \| `"UNKNOWN_ZONE"`

***

### tags?

> `optional` **tags?**: `string`[] \| `null`

***

### color?

> `optional` **color?**: `string` \| `null`

***

### timestamp

> **timestamp**: `number`

Slot start, epoch ms.
