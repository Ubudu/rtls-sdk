// Local ESLint plugin `rtls-test` (P0 §5.4): rules that reject tests which cannot fail.
import noSwallowedCatch from './rules/no-swallowed-catch.mjs';
import noWeakOnlyAssertions from './rules/no-weak-only-assertions.mjs';
import requireDescribeLive from './rules/require-describe-live.mjs';

const plugin = {
  meta: { name: 'rtls-test', version: '1.0.0' },
  rules: {
    'no-swallowed-catch': noSwallowedCatch,
    'no-weak-only-assertions': noWeakOnlyAssertions,
    'require-describe-live': requireDescribeLive,
  },
};

export default plugin;
