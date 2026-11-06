/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Entry point for the in-app update check.
 *
 * Loaded as its own module script like every other feature here — the app has
 * no single entry point, so a feature starts by being listed in index.html.
 */
import {initUpdateCheck} from './services/updateCheck';

initUpdateCheck();
