// Mock framer-motion
module.exports = {
  motion: ({ children, ...props }) => children,
  AnimatePresence: ({ children }) => children,
};