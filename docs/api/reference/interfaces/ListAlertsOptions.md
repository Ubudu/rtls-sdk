[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListAlertsOptions

# Interface: ListAlertsOptions

Options of `alerts.list`: the time range (`Date`, epoch ms or a date string; default the last 24 hours) and
`size` (1…10 000; server default 100). The spec makes both bounds required numbers-as-strings (USI-P5-11).

## Properties

### timestampFrom?

> `optional` **timestampFrom?**: `string` \| `number` \| `Date`

***

### timestampTo?

> `optional` **timestampTo?**: `string` \| `number` \| `Date`

***

### size?

> `optional` **size?**: `number`
