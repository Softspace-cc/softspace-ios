import { create } from 'zustand';

interface LayoutState {
  mobileSidebarOpen: boolean;
  mobileChannelSidebarOpen: boolean;
  mobileMemberListOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  setMobileChannelSidebarOpen: (open: boolean) => void;
  setMobileMemberListOpen: (open: boolean) => void;
  closeAllMobileNav: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  mobileSidebarOpen: false,
  mobileChannelSidebarOpen: false,
  mobileMemberListOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setMobileChannelSidebarOpen: (open) => set({ mobileChannelSidebarOpen: open }),
  setMobileMemberListOpen: (open) => set({ mobileMemberListOpen: open }),
  closeAllMobileNav: () => set({
    mobileSidebarOpen: false,
    mobileChannelSidebarOpen: false,
    mobileMemberListOpen: false,
  })
}));
