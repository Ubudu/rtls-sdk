[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleIssueCode

# Type Alias: AlertRuleIssueCode

> **AlertRuleIssueCode** = `"SET_NOT_OBJECT"` \| `"SET_NAME_NOT_STRING"` \| `"SET_RULES_NOT_ARRAY"` \| `"RULE_NOT_OBJECT"` \| `"RULE_ID_MISSING"` \| `"RULE_ID_DUPLICATE"` \| `"TEMPLATE_UNBALANCED"` \| `"TEMPLATE_UNSUPPORTED"` \| `"EVENT_MISSING"` \| `"EVENT_TYPE_MISSING"` \| `"CONDITIONS_MISSING"` \| `"CONDITIONS_ROOT_INVALID"` \| `"CONDITION_GROUP_NOT_ARRAY"` \| `"CONDITION_NOT_SUPPORTED"` \| `"CONDITION_FACT_MISSING"` \| `"CONDITION_OPERATOR_MISSING"` \| `"CONDITION_VALUE_MISSING"` \| `"CONDITION_OPERATOR_UNKNOWN"` \| `"PRIORITY_INVALID"` \| `"FACT_DOTTED_USER_DATA"` \| `"EVENT_TYPE_UNKNOWN"` \| `"COALESCENCE_MISSING"` \| `"TEMPLATE_RAW"` \| `"LEGACY_DECISIONS"`

The issue codes of `validateAlertRuleSet`. Errors block every SDK write; warnings never do.
Not part of the spec: the server does not validate rule documents (USI-P5-2).
