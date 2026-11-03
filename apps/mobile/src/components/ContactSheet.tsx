import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import type { JobStatus } from "@feista/core";
import { gutter, space, type } from "../theme/tokens";
import { Frame } from "./Frame";
import { StatusMark } from "./StatusMark";

export interface SheetItem {
  id: string;
  frameNo: string;
  blurhash: string;
  aspect: number;
  title: string;
  caption: string;
  status: JobStatus;
}

type Props = {
  items: SheetItem[];
  onOpen: (id: string) => void;
  header?: ReactElement;
  empty?: ReactElement;
  bottomInset?: number;
  topInset?: number;
};

const Cell = memo(function Cell({ item, onOpen, left }: { item: SheetItem; onOpen: (id: string) => void; left: boolean }) {
  return (
    <Pressable
      onPress={() => onOpen(item.id)}
      style={({ pressed }) => [styles.cell, left ? styles.left : styles.right, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.caption}`}
      accessibilityHint="Opens the project"
    >
      <Frame blurhash={item.blurhash} frameNo={item.frameNo} aspect={item.aspect} accessibilityLabel={`Key frame of ${item.title}`} />
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={type.monoXS}>{item.caption}</Text>
        <StatusMark status={item.status} size={8} />
      </View>
    </Pressable>
  );
});

/** Two-up contact sheet, virtualised (FlashList) — a project library can get long. */
export function ContactSheet({ items, onOpen, header, empty, bottomInset = 0, topInset = 0 }: Props) {
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<SheetItem>) => <Cell item={item} onOpen={onOpen} left={index % 2 === 0} />, [onOpen]);
  const container = useMemo(() => ({ paddingTop: topInset, paddingBottom: bottomInset + space[7] }), [topInset, bottomInset]);
  return (
    <FlashList
      data={items}
      numColumns={2}
      keyExtractor={keyOf}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={container}
    />
  );
}

const keyOf = (i: SheetItem) => i.id;

const styles = StyleSheet.create({
  cell: { paddingBottom: space[6] },
  left: { paddingLeft: gutter.left, paddingRight: space[2] },
  // Equal frame widths despite the asymmetric page gutter.
  right: { paddingLeft: space[2] + gutter.left - gutter.right, paddingRight: gutter.right },
  pressed: { opacity: 0.7 },
  meta: { paddingTop: space[3], gap: space[2] },
  title: { ...type.bodyStrong, fontSize: 14, lineHeight: 18, minHeight: 36 }, // 2 lines reserved so rows align
});
