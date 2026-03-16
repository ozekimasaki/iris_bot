type DescriptionLocalizable<T> = {
  setDescriptionLocalizations(localizations: Record<string, string>): T;
};

export function withDescriptionLocales<T extends DescriptionLocalizable<T>>(
  builder: T,
  ja: string,
  zhCN: string,
) {
  return builder.setDescriptionLocalizations({
    ja,
    'zh-CN': zhCN,
  });
}
