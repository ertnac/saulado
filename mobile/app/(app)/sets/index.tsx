import type { ReactElement } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SetList } from '../../../components/set-list'

/**
 * The library — every set the user owns, roots only.
 *
 * Sets nest, so a child is reached through its parent rather than listed here:
 * a flat list of every depth shows each child twice, once under its parent and
 * once on its own.
 *
 * No archive toggle and no per-row edit or delete. Phase 4's deliverable is
 * "create a set, write a card, place blanks, save, study it", and set management
 * is a separate surface with its own confirm dialog — deleting a set cascades
 * through every sub-set and card under it, which is not something to ship behind
 * an untested swipe gesture.
 */
export default function SetsScreen(): ReactElement {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="gap-5 p-5 pb-8"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-1">
          <Text className="text-2xl font-semibold text-foreground">Your sets</Text>
          <Text className="text-sm text-muted-foreground">
            A set groups cards on one subject. Open one to add cards, or nest a sub-set inside it.
          </Text>
        </View>

        <SetList
          parent={null}
          emptyText="No sets yet. Start with one paragraph of your notes — highlight the words worth recalling and Saulado keeps the sentence around them."
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
