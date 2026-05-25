import { Text as DefaultText, View as DefaultView } from 'react-native';

export type TextProps = DefaultText['props'];
export type ViewProps = DefaultView['props'];

export function Text(props: TextProps) {
  return <DefaultText {...props} />;
}

export function View(props: ViewProps) {
  return <DefaultView {...props} />;
}
