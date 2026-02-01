// ============================================================================
// CORE LOGIC VERSION MANAGER
// ============================================================================
// This file manages access to versioned Core Logic documents and constants.
// The ACTIVE_VERSION determines which version is used by the signal engine.
// ============================================================================

import { 
  CORE_LOGIC_V1_0_DOCUMENT, 
  CORE_LOGIC_V1_0_CONSTANTS, 
  CORE_LOGIC_V1_0_VERSION,
  CORE_LOGIC_V1_0_FILENAME,
  type CoreLogicConstants,
} from './core-logic-v1.0';

import { 
  CORE_LOGIC_V1_1_DOCUMENT, 
  CORE_LOGIC_V1_1_CONSTANTS, 
  CORE_LOGIC_V1_1_VERSION,
  CORE_LOGIC_V1_1_FILENAME,
} from './core-logic-v1.1';

import { 
  CORE_LOGIC_V1_3_DOCUMENT, 
  CORE_LOGIC_V1_3_CONSTANTS, 
  CORE_LOGIC_V1_3_VERSION,
  CORE_LOGIC_V1_3_FILENAME,
} from './core-logic-v1.3';

// ============================================================================
// ACTIVE VERSION CONFIGURATION
// ============================================================================
// Change this to switch which version the signal engine uses.
// All new signals will be tagged with this version.
// ============================================================================

export const ACTIVE_CORE_LOGIC_VERSION = "v1.3";

// ============================================================================
// AVAILABLE VERSIONS
// ============================================================================

export type CoreLogicVersion = "v1.0" | "v1.1" | "v1.3";

export const AVAILABLE_VERSIONS: CoreLogicVersion[] = ["v1.0", "v1.1", "v1.3"];

export const VERSION_METADATA: Record<CoreLogicVersion, { 
  label: string; 
  status: 'frozen' | 'experimental' | 'active';
  description: string;
}> = {
  "v1.0": {
    label: "v1.0 (canonical)",
    status: "frozen",
    description: "Baseline version - immutable reference for backtesting",
  },
  "v1.1": {
    label: "v1.1 (frozen)",
    status: "frozen",
    description: "Tuned thresholds - frozen for comparison",
  },
  "v1.3": {
    label: "v1.3 (active)",
    status: "active",
    description: "Match Failure Flip - observable team resolution",
  },
};

// ============================================================================
// VERSION ACCESSORS
// ============================================================================

/**
 * Get the Core Logic document for a specific version
 */
export function getCoreLogicDocument(version: CoreLogicVersion = ACTIVE_CORE_LOGIC_VERSION): string {
  switch (version) {
    case "v1.0":
      return CORE_LOGIC_V1_0_DOCUMENT;
    case "v1.1":
      return CORE_LOGIC_V1_1_DOCUMENT;
    case "v1.3":
      return CORE_LOGIC_V1_3_DOCUMENT;
    default:
      return CORE_LOGIC_V1_1_DOCUMENT;
  }
}

/**
 * Get the programmable constants for a specific version
 */
export function getCoreLogicConstants(version: CoreLogicVersion = ACTIVE_CORE_LOGIC_VERSION): CoreLogicConstants {
  switch (version) {
    case "v1.0":
      return CORE_LOGIC_V1_0_CONSTANTS;
    case "v1.1":
      return CORE_LOGIC_V1_1_CONSTANTS;
    case "v1.3":
      return CORE_LOGIC_V1_3_CONSTANTS;
    default:
      return CORE_LOGIC_V1_1_CONSTANTS;
  }
}

/**
 * Get the filename for a specific version's document
 */
export function getCoreLogicFilename(version: CoreLogicVersion = ACTIVE_CORE_LOGIC_VERSION): string {
  switch (version) {
    case "v1.0":
      return CORE_LOGIC_V1_0_FILENAME;
    case "v1.1":
      return CORE_LOGIC_V1_1_FILENAME;
    case "v1.3":
      return CORE_LOGIC_V1_3_FILENAME;
    default:
      return CORE_LOGIC_V1_1_FILENAME;
  }
}

/**
 * Get version metadata
 */
export function getVersionMetadata(version: CoreLogicVersion) {
  return VERSION_METADATA[version];
}

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================
// These exports maintain compatibility with existing code that imports
// from this file directly. They always use the ACTIVE version.
// ============================================================================

export const CORE_LOGIC_VERSION = ACTIVE_CORE_LOGIC_VERSION;
export const CORE_LOGIC_FILENAME = getCoreLogicFilename(ACTIVE_CORE_LOGIC_VERSION);
export const CORE_LOGIC_DOCUMENT = getCoreLogicDocument(ACTIVE_CORE_LOGIC_VERSION);

// Export active constants for direct access
export const CORE_LOGIC_CONSTANTS = getCoreLogicConstants(ACTIVE_CORE_LOGIC_VERSION);
