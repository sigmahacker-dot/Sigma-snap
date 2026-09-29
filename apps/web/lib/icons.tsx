// SIGMA SNAP original icon set — hand-drawn 24×24 line icons.
// Designed for this project; not copied from any existing product.
import React from 'react';

type P = { size?: number; className?: string; strokeWidth?: number };

function Base({ size = 24, className, strokeWidth = 1.8, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

// Brand mark: hexagonal "sigma" sigil — original.
export function Logo({ size = 32, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="sg-g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#7C5CFF" /><stop offset="1" stopColor="#38E1FF" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14L16 30 4 23V9Z" fill="none" stroke="url(#sg-g)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M21 11H11l6 5-6 5h10" fill="none" stroke="url(#sg-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const IconCamera = (p: P) => <Base {...p}><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.4" /></Base>;
export const IconChat = (p: P) => <Base {...p}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4Z" /><path d="M8 9h8M8 12.5h5" /></Base>;
export const IconDiscover = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11Z" /></Base>;
export const IconStories = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" strokeDasharray="3.5 2.6" /><circle cx="12" cy="12" r="3.2" /></Base>;
export const IconProfile = (p: P) => <Base {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" /></Base>;
export const IconFlash = (p: P) => <Base {...p}><path d="M13 2 5 13.5h5L10.5 22 19 10h-5.5Z" /></Base>;
export const IconTorch = (p: P) => <Base {...p}><path d="M9 2h6M10 2v4l-4.5 9a3 3 0 0 0 2.7 4.4h7.6A3 3 0 0 0 18.5 15L14 6V2" /><path d="M12 13.5v3" /></Base>;
export const IconTimer = (p: P) => <Base {...p}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M9.5 2.5h5M12 2.5V6" /></Base>;
export const IconGrid = (p: P) => <Base {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></Base>;
export const IconSwitchCam = (p: P) => <Base {...p}><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" /><path d="M20 3v5h-5M4 21v-5h5" /></Base>;
export const IconSend = (p: P) => <Base {...p}><path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10Z" /></Base>;
export const IconHeart = (p: P) => <Base {...p}><path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 8.1 5c1.6 0 3 .9 3.9 2.2A4.6 4.6 0 0 1 15.9 5a4.6 4.6 0 0 1 4.6 4.6c0 5.8-8.5 10.9-8.5 10.9Z" /></Base>;
export const IconHeartFill = (p: P) => (<svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" className={p.className} fill="currentColor" aria-hidden><path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 8.1 5c1.6 0 3 .9 3.9 2.2A4.6 4.6 0 0 1 15.9 5a4.6 4.6 0 0 1 4.6 4.6c0 5.8-8.5 10.9-8.5 10.9Z" /></svg>);
export const IconComment = (p: P) => <Base {...p}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /><path d="M9 11h.01M12.5 11h.01M16 11h.01" /></Base>;
export const IconShare = (p: P) => <Base {...p}><circle cx="6" cy="12" r="2.6" /><circle cx="17.5" cy="5.5" r="2.6" /><circle cx="17.5" cy="18.5" r="2.6" /><path d="M8.3 10.8 15 7M8.3 13.2 15 17" /></Base>;
export const IconSave = (p: P) => <Base {...p}><path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1Z" /></Base>;
export const IconSearch = (p: P) => <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></Base>;
export const IconBell = (p: P) => <Base {...p}><path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></Base>;
export const IconSettings = (p: P) => <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.15-1.4l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.4-1.4L13.7 2h-3.4l-.45 2.6a7 7 0 0 0-2.4 1.4l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.4 1.4l.45 2.6h3.4l.45-2.6a7 7 0 0 0 2.4-1.4l2.3 1 2-3.4-2-1.5c.1-.45.15-.92.15-1.4Z" /></Base>;
export const IconPlus = (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconX = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const IconCheck = (p: P) => <Base {...p}><path d="m4.5 12.5 5 5 10-11" /></Base>;
export const IconChevronLeft = (p: P) => <Base {...p}><path d="M14.5 5 8 12l6.5 7" /></Base>;
export const IconChevronRight = (p: P) => <Base {...p}><path d="m9.5 5 6.5 7-6.5 7" /></Base>;
export const IconMic = (p: P) => <Base {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Base>;
export const IconMicOff = (p: P) => <Base {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 11.5 4M12 17.5V21M4 4l16 16" /></Base>;
export const IconVideo = (p: P) => <Base {...p}><rect x="3" y="7" width="12.5" height="10" rx="2.5" /><path d="m15.5 10.5 5-3v9l-5-3" /></Base>;
export const IconVideoOff = (p: P) => <Base {...p}><rect x="3" y="7" width="12.5" height="10" rx="2.5" /><path d="m15.5 10.5 5-3v9l-5-3M4 4l16 16" /></Base>;
export const IconPhone = (p: P) => <Base {...p}><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></Base>;
export const IconPhoneOff = (p: P) => <Base {...p}><path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /><path d="M4 4l16 16" /></Base>;
export const IconSpeaker = (p: P) => <Base {...p}><path d="M4 10v4h3l4 3.5v-11L7 10Z" /><path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10" /></Base>;
export const IconImage = (p: P) => <Base {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m5 18 5-5 3.5 3.5L17 13l3.5 3.5" /></Base>;
export const IconMusic = (p: P) => <Base {...p}><circle cx="7" cy="17.5" r="2.8" /><circle cx="17.5" cy="16" r="2.8" /><path d="M9.8 17.5V6l10-2.5V16" /></Base>;
export const IconPin = (p: P) => <Base {...p}><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0c0 5 6.5 11 6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></Base>;
export const IconEdit = (p: P) => <Base {...p}><path d="m14.5 5.5 4 4L8 20l-5 1 1-5Z" /><path d="m12.5 7.5 4 4" /></Base>;
export const IconTrash = (p: P) => <Base {...p}><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10 11v6M14 11v6" /></Base>;
export const IconBlock = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></Base>;
export const IconFlag = (p: P) => <Base {...p}><path d="M6 21V4" /><path d="M6 5c4-2.5 8 2.5 12 0v8c-4 2.5-8-2.5-12 0" /></Base>;
export const IconPlay = (p: P) => <Base {...p}><path d="M8 5.5v13l11-6.5Z" /></Base>;
export const IconPause = (p: P) => <Base {...p}><path d="M9 5.5v13M15 5.5v13" /></Base>;
export const IconUsers = (p: P) => <Base {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c1.2-3 3.4-4.5 6-4.5s4.8 1.5 6 4.5" /><path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.7M17.5 15.3c1.7.7 3 2 3.7 4.2" /></Base>;
export const IconUserPlus = (p: P) => <Base {...p}><circle cx="10" cy="8" r="3.4" /><path d="M3.5 19.5c1.3-3.2 3.7-4.8 6.5-4.8 1 0 2 .2 2.9.6M18.5 8v6M15.5 11h6" /></Base>;
export const IconSparkles = (p: P) => <Base {...p}><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><path d="M12 8.5 13.8 12l3.7 1.8-3.7 1.7L12 19.2l-1.8-3.7-3.7-1.7L10.2 12Z" /></Base>;
export const IconWand = (p: P) => <Base {...p}><path d="m5 19 9.5-9.5M14 4l.9 2.1L17 7l-2.1.9L14 10l-.9-2.1L11 7l2.1-.9ZM19 11l.7 1.8 1.8.7-1.8.7L19 16l-.7-1.8-1.8-.7 1.8-.7Z" /></Base>;
export const IconDownload = (p: P) => <Base {...p}><path d="M12 4v11M7.5 11 12 15.5 16.5 11M4.5 20h15" /></Base>;
export const IconLock = (p: P) => <Base {...p}><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Base>;
export const IconEye = (p: P) => <Base {...p}><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></Base>;
export const IconEyeOff = (p: P) => <Base {...p}><path d="M4 4l16 16" /><path d="M9.9 6.2A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.3 3.7M6 8.4A16 16 0 0 0 2.5 12S6 18.2 12 18.2c1.1 0 2.2-.2 3.1-.6" /></Base>;
export const IconText = (p: P) => <Base {...p}><path d="M5 6V4.5h14V6M12 4.5V20M9 20h6" /></Base>;
export const IconPen = (p: P) => <Base {...p}><path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19Z" /><path d="m14.5 6.5 3 3" /></Base>;
export const IconSmile = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2" /><path d="M9 9.5h.01M15 9.5h.01" /></Base>;
export const IconGlobe = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.8 2.4 4.2 5.3 4.2 8.5s-1.4 6.1-4.2 8.5c-2.8-2.4-4.2-5.3-4.2-8.5S9.2 5.9 12 3.5Z" /></Base>;
export const IconZap = (p: P) => <Base {...p}><path d="M13 2.5 4.5 13.5H11L10 21.5 19.5 10H13Z" /></Base>;
export const IconStar = (p: P) => <Base {...p}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8Z" /></Base>;
export const IconMore = (p: P) => <Base {...p}><circle cx="5.5" cy="12" r=".5" fill="currentColor" /><circle cx="12" cy="12" r=".5" fill="currentColor" /><circle cx="18.5" cy="12" r=".5" fill="currentColor" /></Base>;
export const IconReply = (p: P) => <Base {...p}><path d="M9 10 4.5 14.5 9 19" /><path d="M5 14.5h8a6 6 0 0 1 0 12h-2" transform="translate(0 -6)" /><path d="M5 8.5h8a6 6 0 0 1 6 6v1" /></Base>;
export const IconVolume = (p: P) => <Base {...p}><path d="M4 10v4h3l4 3.5v-11L7 10Z" /><path d="M15 10.5v3M13.5 12h3" /></Base>;
export const IconScissors = (p: P) => <Base {...p}><circle cx="6.5" cy="7" r="2.5" /><circle cx="6.5" cy="17" r="2.5" /><path d="M8.5 8.8 20 19M8.5 15.2 20 5" /></Base>;
export const IconFilter = (p: P) => <Base {...p}><path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8Z" /></Base>;
export const IconCrop = (p: P) => <Base {...p}><path d="M7 2v15a1 1 0 0 0 1 1h13M2 7h15a1 1 0 0 1 1 1v13" /></Base>;
export const IconLogout = (p: P) => <Base {...p}><path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h11M18 8.5 21.5 12 18 15.5" /></Base>;
export const IconShield = (p: P) => <Base {...p}><path d="M12 2.5 20 6v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6Z" /><path d="m8.8 12 2.2 2.2 4.2-4.7" /></Base>;
export const IconChart = (p: P) => <Base {...p}><path d="M4 20V4M4 20h16" /><path d="M8.5 16v-5M13 16V8M17.5 16v-3" /></Base>;
export const IconClock = (p: P) => <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Base>;
export const IconRefresh = (p: P) => <Base {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v4.5h-4.5" /></Base>;
export const IconWallet = (p: P) => <Base {...p}><rect x="3" y="6.5" width="18" height="12.5" rx="2.5" /><path d="M3 10h18M16 15h.01" /></Base>;
export const IconTemplate = (p: P) => <Base {...p}><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M4 9.5h16M9.5 9.5V20" /></Base>;
export const IconClose = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const IconMegaphone = (p: P) => <Base {...p}><path d="M4 10v4l3 .5V9.5Z" /><path d="M7 9.5 18 5v13l-11-3.5" /><path d="M18 8.5a3.5 3.5 0 0 1 0 6M9 15.5V19a1.5 1.5 0 0 0 3 0v-2.7" /></Base>;
export const IconBookmark = (p: P) => <Base {...p}><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-3.8L6 21V4.5a1 1 0 0 1 1-1Z" /></Base>;
export const IconBookmarkFill = (p: P) => (<svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" className={p.className} fill="currentColor" aria-hidden><path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-3.8L6 21V4.5a1 1 0 0 1 1-1Z" /></svg>);
export const IconCopy = (p: P) => <Base {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Base>;
