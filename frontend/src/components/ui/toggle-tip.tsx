import {
  Popover as ChakraPopover,
  Portal,
  type PopoverContentProps,
  type PopoverRootProps,
} from "@chakra-ui/react";
import { forwardRef, type ReactNode, type RefObject } from "react";

export interface ToggleTipProps extends ChakraPopover.RootProps {
  showArrow?: boolean;
  portalled?: boolean;
  portalRef?: RefObject<HTMLElement | null>;
  content: ReactNode;
  contentProps?: PopoverContentProps;
  children: ReactNode;
}

export const ToggleTip = forwardRef<HTMLDivElement, ToggleTipProps>(
  function ToggleTip(props, ref) {
    const {
      showArrow,
      children,
      portalled = true,
      content,
      contentProps,
      portalRef,
      positioning,
      ...rest
    } = props;

    return (
      <ChakraPopover.Root
        {...(rest as PopoverRootProps)}
        positioning={{ gutter: 6, ...positioning }}
        lazyMount
        unmountOnExit
      >
        <ChakraPopover.Trigger asChild>{children}</ChakraPopover.Trigger>
        <Portal disabled={!portalled} container={portalRef}>
          <ChakraPopover.Positioner>
            <ChakraPopover.Content
              ref={ref}
              width="min(24rem, calc(100vw - 2rem))"
              rounded="xl"
              border="1px solid var(--weather-panel-border)"
              bg="var(--weather-panel-bg)"
              color="var(--weather-text-main)"
              boxShadow="var(--weather-panel-shadow)"
              backdropFilter="blur(14px)"
              {...contentProps}
            >
              {showArrow ? (
                <ChakraPopover.Arrow>
                  <ChakraPopover.ArrowTip bg="var(--weather-panel-bg)" />
                </ChakraPopover.Arrow>
              ) : null}
              {content}
            </ChakraPopover.Content>
          </ChakraPopover.Positioner>
        </Portal>
      </ChakraPopover.Root>
    );
  },
);