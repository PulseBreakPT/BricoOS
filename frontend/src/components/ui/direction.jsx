import * as DirectionPrimitive from "@radix-ui/react-direction"

function DirectionProvider({ dir, direction, children }) {
  return (
    <DirectionPrimitive.DirectionProvider dir={direction ?? dir}>
      {children}
    </DirectionPrimitive.DirectionProvider>
  )
}

const useDirection = DirectionPrimitive.useDirection

export { DirectionProvider, useDirection }
