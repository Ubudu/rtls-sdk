[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationStream

# Interface: NotificationStream

The live stream of the caller's inbox: an async iterable and an emitter.

## Remarks

Spec: `/stream` is typed as a `string`.

## Extends

- `AsyncIterable`\<[`NotificationStreamEvent`](../type-aliases/NotificationStreamEvent.md)\>

## Properties

### done

> `readonly` **done**: `Promise`\<[`NotificationStreamEnd`](../type-aliases/NotificationStreamEnd.md)\>

Always resolves, never rejects.

## Methods

### on()

#### Call Signature

> **on**\<`T`\>(`type`, `listener`): `this`

##### Type Parameters

###### T

`T` *extends* `"open"` \| `"state"` \| `"item"` \| `"unread_count"` \| `"reconnected"`

##### Parameters

###### type

`T`

###### listener

(`event`) => `void`

##### Returns

`this`

#### Call Signature

> **on**(`type`, `listener`): `this`

##### Parameters

###### type

`"error"`

###### listener

(`error`, `info`) => `void`

##### Returns

`this`

***

### off()

> **off**(`type`, `listener`): `this`

#### Parameters

##### type

`"error"` \| `"open"` \| `"state"` \| `"item"` \| `"unread_count"` \| `"reconnected"`

##### listener

(...`args`) => `void`

#### Returns

`this`
