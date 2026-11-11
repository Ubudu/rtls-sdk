export const builders = {
  equals: (field: string, value: string) => `${field}=${value}`,
  notEquals(field: string, value: string) {
    return `${field}!=${value}`;
  },
  label: 'filters',
};
