import { Graphics, Container, Text, TextStyle, Ellipse, Rectangle } from 'pixi.js';
import type { CloudNode, EntityType } from '../types';
import { ANIMATION } from '../config/animation';
import { CLOUD } from '../config/constants';
import { blendColors, CLOUD_COLORS } from '../utils/colorUtils';
import { SeededRandom, createMorphSeed } from '../utils/SeededRandom';
import { ParticlePool, type Particle } from '../cloud/ParticlePool';

/**
 * Options for drawing the cloud with various visual states
 */
interface DrawOptions {
  /** Blue glow for drop target highlight (0-1) */
  highlightLevel?: number;
  /** Red tint for delete zone danger (0-1) */
  dangerLevel?: number;
  /** Green tint for complete zone (0-1) */
  completeLevel?: number;
  /** Gray tint for neglected clouds (0-1) */
  neglectLevel?: number;
  /** Shared frame timestamp to avoid multiple Date.now() calls */
  frameTime?: number;
}

// Puff for cloud morphing
interface Puff {
  x: number;  // Local position X
  y: number;  // Local position Y
  r: number;  // Radius
}

export class Cloud extends Container {
  // PERF: Static frame counter for idle detection frame skipping
  private static frameCount = 0;

  public static incrementFrame(): void {
    Cloud.frameCount++;
  }

  public static getFrameCount(): number {
    return Cloud.frameCount;
  }

  public node: CloudNode;
  private cloudGraphics: Graphics;
  private cloudLabel: Text;
  private targetScale = 1;
  private currentScale = 1;
  private targetAlpha = 1;
  private bumpOffsets: { angle: number; radiusMult: number; distMult: number }[] = [];

  // Dissolve animation state
  private dissolving = false;
  private dissolveProgress = 0;
  private dissolveCallback: (() => void) | null = null;
  private dissolveDuration: number = ANIMATION.DISSOLVE_TASK_MS;
  private particles: Particle[] = [];
  private particleGraphics: Graphics;

  // Drag state
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private homeAnchorX = 0;
  private homeAnchorY = 0;
  private highlightAsDropTarget = false;
  private dangerLevel = 0; // 0-1 for delete zone proximity
  private completeLevel = 0; // 0-1 for complete zone proximity (top edge)

  // Neglect state (from design brief: clusters darken, roughen, wobble when neglected)
  private neglectLevel = 0; // 0-1 where 1 = severely neglected (72h+)

  // Redraw caching - only redraw when levels change significantly
  private lastDrawnDangerLevel = -1;
  private lastDrawnNeglectLevel = -1;
  private lastDrawnCompleteLevel = -1;

  // Spawn animation state
  private isSpawning = true;
  private spawnProgress = 0;
  private spawnStartTime = Date.now();

  // Breathing animation state (unique offset per cloud for organic feel)
  private breatheOffset = 0; // Initialized deterministically in constructor

  // Focus state (cloud morphs to fit content)
  private isFocusedNode = false;
  private isChildOfFocusedNode = false;

  // Puff-based morphing
  private basePuffs: Puff[] = [];      // Base cloud arrangement
  private targetPuffs: Puff[] = [];    // Target for morphing
  private currentPuffs: Puff[] = [];   // Current (animated) positions
  private morphComplete = true;        // Skip interpolation when all puffs settled
  public coverageR = 0;                 // Current coverage radius (animated, for visuals)
  public requiredCoverageR = 0;         // Authoritative final size for layout (non-animated)

  // Focus content (rendered INSIDE cloud)
  private focusContentContainer: Container | null = null;
  private focusTitleText: Text | null = null;
  private focusDescText: Text | null = null;
  private focusDueDateText: Text | null = null;
  private focusProgressText: Text | null = null;
  private focusCompleteButton: Container | null = null;
  private focusCompleteButtonBg: Graphics | null = null;
  private focusCompleteButtonText: Text | null = null;

  // Child-of-focused content (rendered INSIDE cloud)
  private childContentContainer: Container | null = null;
  private childTitleText: Text | null = null;
  private childDescText: Text | null = null;
  private childCheckbox: Graphics | null = null;
  private onCompleteCallback: (() => void) | null = null;

  constructor(node: CloudNode, skipSpawnAnimation = false) {
    super();

    // Initialize particle pool on first cloud creation
    ParticlePool.initialize();

    this.node = node;
    this.x = node.x;
    this.y = node.y;

    // Skip spawn animation for pre-existing clouds (initial load)
    if (skipSpawnAnimation) {
      this.isSpawning = false;
      this.spawnProgress = 1;
      // Initialize scale and alpha immediately (normally set during spawn animation)
      this.scale.set(1);
      this.alpha = 1;
    }

    // DETERMINISTIC: Generate consistent bump offsets for this cloud using seeded RNG
    const baseSeed = createMorphSeed(this.node.id, 'base', 0, 0);
    const baseRng = new SeededRandom(baseSeed);

    // Deterministic breathe offset for organic feel
    this.breatheOffset = baseRng.next() * Math.PI * 2;

    const bumpCount = this.node.type === 'milestone' ? 7 : this.node.type === 'task' ? 6 : 5;
    for (let i = 0; i < bumpCount; i++) {
      this.bumpOffsets.push({
        angle: (i / bumpCount) * Math.PI * 2 + (baseRng.next() - 0.5) * 0.3,
        radiusMult: 0.35 + baseRng.next() * 0.2,
        distMult: 0.4 + baseRng.next() * 0.15,
      });
    }

    // Generate base puffs from bumpOffsets
    const r = this.node.radius;
    // Central puff
    this.basePuffs.push({ x: 0, y: 0, r: r * 0.65 });
    // Edge puffs from bumpOffsets
    for (const bump of this.bumpOffsets) {
      const dist = r * bump.distMult;
      this.basePuffs.push({
        x: Math.cos(bump.angle) * dist,
        y: Math.sin(bump.angle) * dist,
        r: r * bump.radiusMult
      });
    }
    // Initialize current and target puffs
    this.currentPuffs = this.basePuffs.map(p => ({ ...p }));
    this.targetPuffs = this.basePuffs.map(p => ({ ...p }));

    // Create cloud shape
    this.cloudGraphics = new Graphics();
    this.addChild(this.cloudGraphics);
    // Note: drawCloud() is NOT called here - it will be called by setNeglectLevel()
    // after the cloud is fully initialized in SkyCanvas to avoid timing issues

    // Create particle graphics layer (on top of cloud)
    this.particleGraphics = new Graphics();
    this.addChild(this.particleGraphics);

    // Create label
    const style = new TextStyle({
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontSize: this.getFontSize(),
      fill: 0x4a5568,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: node.radius * 1.5,
    });

    const title = this.getTitle();
    this.cloudLabel = new Text({ text: title, style });
    this.cloudLabel.anchor.set(0.5);
    // Set initial resolution for sharp text on HiDPI displays
    this.cloudLabel.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.addChild(this.cloudLabel);

    // Enable interactivity
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }
  private _lastLabelRes = -1;
  private _lastFocusRes = -1;

  public setLabelZoom(zoom: number): void {
    // Let text scale normally with the cloud, but increase raster resolution as you zoom in
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Tune these:
    const minRes = 1;   // looks ok when zoomed out
    const maxRes = 4;   // prevent huge textures
    const res = Math.max(minRes, Math.min(maxRes, dpr * zoom));

    // Avoid re-rasterizing every frame
    const rounded = Math.round(res * 10) / 10;

    // Update main cloud label
    if (Math.abs(rounded - this._lastLabelRes) >= 0.1) {
      this._lastLabelRes = rounded;
      this.cloudLabel.resolution = rounded;
      // Force refresh depending on Pixi version
      this.cloudLabel.text = this.cloudLabel.text;
    }

    // Update focus content texts if visible
    if (this.isFocusedNode && this.focusContentContainer?.visible) {
      this.updateFocusTextResolution(rounded);
    }

    // Update child content texts if visible
    if (this.isChildOfFocusedNode && this.childContentContainer?.visible) {
      this.updateChildTextResolution(rounded);
    }
  }

  private updateFocusTextResolution(res: number): void {
    if (Math.abs(res - this._lastFocusRes) < 0.1) return;
    this._lastFocusRes = res;

    const texts = [
      this.focusTitleText,
      this.focusDescText,
      this.focusDueDateText,
      this.focusProgressText,
      this.focusCompleteButtonText
    ];

    for (const text of texts) {
      if (text) {
        text.resolution = res;
        text.text = text.text;
      }
    }
  }

  private updateChildTextResolution(res: number): void {
    if (Math.abs(res - this._lastFocusRes) < 0.1) return;
    this._lastFocusRes = res;

    if (this.childTitleText) {
      this.childTitleText.resolution = res;
      this.childTitleText.text = this.childTitleText.text;
    }
    if (this.childDescText) {
      this.childDescText.resolution = res;
      this.childDescText.text = this.childDescText.text;
    }
  }

  private getTitle(): string {
    return 'title' in this.node.entity ? this.node.entity.title : '';
  }

  private getFontSize(): number {
    switch (this.node.type) {
      case 'milestone':
        return 16;
      case 'task':
        return 13;
      case 'subtask':
        return 11;
    }
  }

  private getCloudColor(): { main: number; shadow: number; highlight: number } {
    const entity = this.node.entity;

    // Milestone becomes "complete" (green) when ALL its tasks are completed
    if (this.node.type === 'milestone' && 'tasks' in entity) {
      const tasks = entity.tasks;
      if (Array.isArray(tasks) && tasks.length > 0 && tasks.every((t) => t.completed)) {
        return {
          main: 0x31e6b7,      // Teal (#31e6b7)
          shadow: 0x28c9a0,    // Darker teal
          highlight: 0x5eedc9, // Lighter teal
        };
      }
    }
    // Task completion color override
    if ('completed' in entity && entity.completed) {
      return {
        main: 0x31e6b7,      // Teal (#31e6b7)
        shadow: 0x28c9a0,    // Darker teal
        highlight: 0x5eedc9, // Lighter teal
      };
    }

    switch (this.node.type) {
      case 'milestone':
        return {
          main: 0xffffff,
          shadow: 0xe8e8e8,
          highlight: 0xffffff,
        };
      case 'task':
        return {
          main: 0xf5f5f5,
          shadow: 0xe0e0e0,
          highlight: 0xfafafa,
        };
      case 'subtask':
        return {
          main: 0xeeeeee,
          shadow: 0xd5d5d5,
          highlight: 0xf5f5f5,
        };
    }
  }

  /**
   * Unified cloud drawing method that handles all visual states
   */
  private drawCloud(options: DrawOptions = {}): void {
    const { highlightLevel = 0, dangerLevel = 0, completeLevel = 0, neglectLevel = 0, frameTime } = options;
    const now = frameTime ?? Date.now();
    const r = this.node.radius;
    const baseColors = this.getCloudColor();

    this.cloudGraphics.clear();

    // Calculate blended colors based on active state
    // States are mutually exclusive in priority: complete > danger > highlight > neglect
    let shadowColor = baseColors.shadow;
    let mainColor = baseColors.main;
    let highlightColor = baseColors.highlight;
    let highlightAlpha = 0.6;
    let glowColor: number | null = null;
    let glowAlpha = 0;
    const roughness = neglectLevel * 0.1; // Only applies roughness for neglect

    if (completeLevel > 0) {
      // Green/white glow and tint for completion zone
      shadowColor = blendColors(baseColors.shadow, CLOUD_COLORS.COMPLETE_GREEN, completeLevel * 0.3);
      mainColor = blendColors(baseColors.main, CLOUD_COLORS.COMPLETE_WHITE, completeLevel * 0.5);
      highlightColor = blendColors(baseColors.highlight, CLOUD_COLORS.COMPLETE_WHITE, completeLevel * 0.6);
      highlightAlpha = 0.7;
      if (completeLevel > 0.3) {
        glowColor = CLOUD_COLORS.COMPLETE_GREEN;
        glowAlpha = 0.35 * completeLevel;
      }
    } else if (dangerLevel > 0) {
      // Red tint for delete zone danger
      shadowColor = blendColors(baseColors.shadow, CLOUD_COLORS.DANGER_RED, dangerLevel * 0.5);
      mainColor = blendColors(baseColors.main, CLOUD_COLORS.DANGER_RED, dangerLevel * 0.4);
      highlightColor = blendColors(baseColors.highlight, CLOUD_COLORS.DANGER_HIGHLIGHT, dangerLevel * 0.3);
      if (dangerLevel > 0.3) {
        glowColor = CLOUD_COLORS.DANGER_RED;
        glowAlpha = 0.4 * dangerLevel;
      }
    } else if (highlightLevel > 0) {
      // Blue glow for drop target highlight
      glowColor = CLOUD_COLORS.HIGHLIGHT_BLUE;
      glowAlpha = 0.3 * highlightLevel;
    } else if (neglectLevel > 0) {
      // Storm gray tint for neglected clouds
      shadowColor = blendColors(baseColors.shadow, CLOUD_COLORS.NEGLECT_GRAY, neglectLevel * 0.4);
      mainColor = blendColors(baseColors.main, CLOUD_COLORS.NEGLECT_GRAY, neglectLevel * 0.3);
      highlightColor = blendColors(baseColors.highlight, CLOUD_COLORS.NEGLECT_GRAY, neglectLevel * 0.4);
      highlightAlpha = 0.6 * (1 - neglectLevel * 0.4);
    }

    // Draw glow ring if active (circular glow around cloud)
    if (glowColor !== null && glowAlpha > 0) {
      this.cloudGraphics.circle(0, 0, r * 0.9);
      this.cloudGraphics.fill({ color: glowColor, alpha: glowAlpha });
    }

    // Always draw using puffs (morphing = puff expansion, not ellipse)
    // Shadow layer (offset down-right)
    for (const puff of this.currentPuffs) {
      if (puff.r > 1) {
        // Apply roughness distortion for neglected clouds
        const distortX = roughness > 0 ? Math.sin(now * 0.001) * roughness * 5 : 0;
        const distortY = roughness > 0 ? Math.cos(now * 0.001) * roughness * 5 : 0;
        this.cloudGraphics.circle(puff.x + 3 + distortX, puff.y + 4 + distortY, puff.r * 0.9);
      }
    }
    this.cloudGraphics.fill({ color: shadowColor, alpha: 0.5 });

    // Main cloud body
    for (const puff of this.currentPuffs) {
      if (puff.r > 1) {
        const distortX = roughness > 0 ? Math.sin(now * 0.001) * roughness * 5 : 0;
        const distortY = roughness > 0 ? Math.cos(now * 0.001) * roughness * 5 : 0;
        this.cloudGraphics.circle(puff.x + distortX, puff.y + distortY, puff.r);
      }
    }
    this.cloudGraphics.fill({ color: mainColor, alpha: 0.95 });

    // Highlight (top-left of first puff)
    const highlightPuff = this.currentPuffs[0];
    if (highlightPuff && highlightPuff.r > 1) {
      this.cloudGraphics.circle(
        highlightPuff.x - highlightPuff.r * 0.3,
        highlightPuff.y - highlightPuff.r * 0.3,
        highlightPuff.r * 0.35
      );
      this.cloudGraphics.fill({ color: highlightColor, alpha: highlightAlpha });
    }
  }

  public setHovered(hovered: boolean, isNeighbor = false): void {
    if (hovered) {
      this.targetScale = isNeighbor
        ? ANIMATION.HOVER_SCALE_NEIGHBOR
        : ANIMATION.HOVER_SCALE_MAIN;
    } else {
      this.targetScale = 1;
    }
  }

  public setFocused(focused: boolean): void {
    this.isFocusedNode = focused;
    if (focused) {
      this.targetAlpha = 1;
      this.cloudLabel.visible = false;
      this.layoutFocusedContent();
    } else {
      this.targetAlpha = ANIMATION.FADE_ALPHA;
      this.clearFocusContent();
      // Reset puffs to base
      this.targetPuffs = this.basePuffs.map(p => ({ ...p }));
      if (!this.isChildOfFocusedNode) {
        this.cloudLabel.visible = true;
      }
    }
  }

  public setChildOfFocused(isChild: boolean): void {
    this.isChildOfFocusedNode = isChild;
    if (isChild) {
      this.targetAlpha = 1;
      this.cloudLabel.visible = false;
      this.layoutChildContent();
    } else {
      this.clearChildContent();
      // Reset puffs to base
      this.targetPuffs = this.basePuffs.map(p => ({ ...p }));
      if (!this.isFocusedNode) {
        this.cloudLabel.visible = true;
      }
    }
  }

  public setOnComplete(callback: (() => void) | null): void {
    this.onCompleteCallback = callback;
  }

  public resetFocus(): void {
    this.targetAlpha = 1;
    this.isFocusedNode = false;
    this.isChildOfFocusedNode = false;
    this.cloudLabel.visible = true;
    this.clearFocusContent();
    this.clearChildContent();
    // Reset puffs to base arrangement (deep copy for determinism)
    this.currentPuffs = this.basePuffs.map(p => ({ ...p }));
    this.targetPuffs = this.basePuffs.map(p => ({ ...p }));
    // Reset required coverage to base (for overview mode)
    this.requiredCoverageR = 0;
    // Reset resolution cache to force update on next zoom
    this._lastLabelRes = -1;
    this._lastFocusRes = -1;
    // Force immediate redraw with base puffs
    this.drawCloud({ dangerLevel: this.dangerLevel, completeLevel: this.completeLevel });
  }

  /**
   * Force synchronous focus layout computation without waiting for animation ticks.
   * Called by SkyCanvas before orbit calculation to ensure requiredCoverageR is available.
   * @deprecated Use computeRequiredSizeNow() instead
   */
  public forceFocusLayout(): void {
    if (this.isFocusedNode) {
      this.layoutFocusedContent();
    } else if (this.isChildOfFocusedNode) {
      this.layoutChildContent();
    }
    // requiredCoverageR is now set and ready for orbit calculations
  }

  /**
   * Compute requiredCoverageR synchronously based on current mode.
   * May return 0 if bounds are not yet valid (before first render).
   * SkyCanvas should call this in RAF to ensure bounds are ready.
   */
  public computeRequiredSizeNow(mode: "focused" | "child"): void {
    if (mode === "focused") {
      this.layoutFocusedContent();
    } else {
      this.layoutChildContent();
    }
    // Force redraw to apply new puff targets immediately
    this.drawCloud({ dangerLevel: this.dangerLevel, completeLevel: this.completeLevel });
    // requiredCoverageR is set if bounds are valid, otherwise may be 0
  }

  // Padding constants for focus mode
  private static readonly PADDING_X = 40;
  private static readonly PADDING_Y = 32;
  private static readonly MAX_DESC_LINES = 3;
  private static readonly APPROX_CHAR_WIDTH = 7; // Approximate width for 13px font

  // === FOCUSED NODE CONTENT ===
  private layoutFocusedContent(): void {
    const entity = this.node.entity;
    const maxContentWidth = 220;

    // Create container if needed
    if (!this.focusContentContainer) {
      this.focusContentContainer = new Container();
      this.addChild(this.focusContentContainer);
    }

    // Clear existing content and destroy to prevent memory leaks
    this.focusContentContainer.removeChildren().forEach(child => child.destroy());
    this.focusTitleText = null;
    this.focusDescText = null;
    this.focusDueDateText = null;
    this.focusProgressText = null;
    this.focusCompleteButton = null;
    this.focusCompleteButtonBg = null;
    this.focusCompleteButtonText = null;

    // Create all text elements fresh
    // Title
    this.focusTitleText = new Text({
        text: '',
        style: {
          fontSize: 18,
          fontWeight: 'bold',
          fill: 0x374151,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: maxContentWidth
        }
      });
      this.focusTitleText.anchor.set(0.5, 0);
      this.focusTitleText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.focusContentContainer.addChild(this.focusTitleText);

      // Description
      this.focusDescText = new Text({
        text: '',
        style: {
          fontSize: 13,
          fill: 0x6b7280,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: maxContentWidth
        }
      });
      this.focusDescText.anchor.set(0.5, 0);
      this.focusDescText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.focusContentContainer.addChild(this.focusDescText);

      // Due date
      this.focusDueDateText = new Text({
        text: '',
        style: {
          fontSize: 11,
          fill: 0x9ca3af,
          align: 'center'
        }
      });
      this.focusDueDateText.anchor.set(0.5, 0);
      this.focusDueDateText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.focusContentContainer.addChild(this.focusDueDateText);

      // Progress [Done/Total]
      this.focusProgressText = new Text({
        text: '',
        style: {
          fontSize: 13,
          fontWeight: '600',
          fill: 0x10b981,
          align: 'center'
        }
      });
      this.focusProgressText.anchor.set(0.5, 0);
      this.focusProgressText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.focusContentContainer.addChild(this.focusProgressText);

      // Completion toggle button
      this.focusCompleteButton = new Container();
      this.focusCompleteButton.eventMode = 'static';
      this.focusCompleteButton.cursor = 'pointer';

      this.focusCompleteButtonBg = new Graphics();
      this.focusCompleteButton.addChild(this.focusCompleteButtonBg);

      this.focusCompleteButtonText = new Text({
        text: '',
        style: {
          fontSize: 12,
          fontWeight: '600',
          fill: 0xffffff,
          align: 'center'
        }
      });
      this.focusCompleteButtonText.anchor.set(0.5, 0.5);
      this.focusCompleteButtonText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.focusCompleteButton.addChild(this.focusCompleteButtonText);

      this.focusCompleteButton.on('pointerdown', (e) => {
        e.stopPropagation();
        if (this.onCompleteCallback) {
          this.onCompleteCallback();
        }
      });

      this.focusContentContainer.addChild(this.focusCompleteButton);

    // Update content
    const title = 'title' in entity ? entity.title : '';
    let desc = 'description' in entity && entity.description ? entity.description : '';
    const dueDate = 'dueDate' in entity && entity.dueDate
      ? `Due: ${new Date(entity.dueDate).toLocaleDateString()}`
      : '';
    const isCompleted = 'completed' in entity && entity.completed;

    // Clamp description to MAX_DESC_LINES
    const maxCharsPerLine = Math.floor(maxContentWidth / Cloud.APPROX_CHAR_WIDTH);
    const maxDescChars = maxCharsPerLine * Cloud.MAX_DESC_LINES;
    if (desc.length > maxDescChars) {
      desc = desc.substring(0, maxDescChars - 3) + '...';
    }

    // Child completion stats
    const children = this.getChildCompletionStats();
    const progressStr = children.total > 0 ? `[${children.completed}/${children.total}]` : '';

    this.focusTitleText!.text = title;
    this.focusDescText!.text = desc;
    this.focusDueDateText!.text = dueDate;
    this.focusProgressText!.text = progressStr;

    // Update completion button
    const buttonText = isCompleted ? 'Mark as Incomplete' : 'Mark as Complete';
    const buttonColor = isCompleted ? 0x6b7280 : 0x10b981;
    this.focusCompleteButtonText!.text = buttonText;

    const btnWidth = 140;
    const btnHeight = 32;
    this.focusCompleteButtonBg!.clear();
    this.focusCompleteButtonBg!.fill({ color: buttonColor });
    this.focusCompleteButtonBg!.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 8);

    // Layout content top-to-bottom starting at y=0 (relative to container origin)
    const spacing = 10;
    let yPos = 0;

    this.focusTitleText!.y = yPos;
    yPos += this.focusTitleText!.height + spacing;

    if (desc) {
      this.focusDescText!.visible = true;
      this.focusDescText!.y = yPos;
      yPos += this.focusDescText!.height + spacing;
    } else {
      this.focusDescText!.visible = false;
    }

    if (dueDate) {
      this.focusDueDateText!.visible = true;
      this.focusDueDateText!.y = yPos;
      yPos += this.focusDueDateText!.height + spacing;
    } else {
      this.focusDueDateText!.visible = false;
    }

    if (progressStr) {
      this.focusProgressText!.visible = true;
      this.focusProgressText!.y = yPos;
      yPos += this.focusProgressText!.height + spacing;
    } else {
      this.focusProgressText!.visible = false;
    }

    // Position button
    this.focusCompleteButton!.y = yPos + btnHeight / 2 + spacing;
    this.focusCompleteButton!.visible = true;

    this.focusContentContainer.visible = true;

    // Measure bounds AFTER setting all content (Pixi auto-updates on getLocalBounds)
    const b = this.focusContentContainer.getLocalBounds();

    // Center container inside cloud based on measured bounds
    this.focusContentContainer.x = -b.x - b.width / 2;
    this.focusContentContainer.y = -b.y - b.height / 2;

    // Calculate required interior size with strict padding
    const requiredW = b.width + Cloud.PADDING_X * 2;
    const requiredH = b.height + Cloud.PADDING_Y * 2;

    // Compute requiredCoverageR IMMEDIATELY (synchronous, for layout)
    const margin = 15;
    const rx = requiredW / 2 + margin;
    const ry = requiredH / 2 + margin;
    this.requiredCoverageR = Math.max(rx, ry);

    // Compute puff morph targets (cosmetic animation, also sets hit area and animated coverageR)
    this.computeMorphPuffs(requiredW, requiredH);
  }

  private clearFocusContent(): void {
    if (this.focusContentContainer) {
      // Destroy all children to prevent memory leaks from Text textures
      this.focusContentContainer.removeChildren().forEach(child => child.destroy());
      this.focusContentContainer.visible = false;
      // Clear references
      this.focusTitleText = null;
      this.focusDescText = null;
      this.focusDueDateText = null;
      this.focusProgressText = null;
      this.focusCompleteButton = null;
      this.focusCompleteButtonBg = null;
      this.focusCompleteButtonText = null;
    }
  }

  // === CHILD OF FOCUSED NODE CONTENT ===
  private layoutChildContent(): void {
    const entity = this.node.entity;
    const maxContentWidth = 130; // Reduced from 150 to keep child clouds smaller
    const MAX_CHILD_TITLE_CHARS = 18; // 1 line max for title
    const MAX_CHILD_DESC_CHARS = 40; // Reduced from 50
    const MAX_CHILD_DESC_LINES = 2;

    // Create container if needed
    if (!this.childContentContainer) {
      this.childContentContainer = new Container();
      this.addChild(this.childContentContainer);
    }

    // Clear existing content and destroy to prevent memory leaks
    this.childContentContainer.removeChildren().forEach(child => child.destroy());
    this.childTitleText = null;
    this.childDescText = null;
    this.childCheckbox = null;

    // Create all elements fresh
    // Title (smaller font, single line)
    this.childTitleText = new Text({
        text: '',
        style: {
          fontSize: 12, // Reduced from 14
          fontWeight: 'bold',
          fill: 0x374151,
          align: 'center',
          wordWrap: false // No wrap - force single line with ellipsis
        }
      });
      this.childTitleText.anchor.set(0.5, 0);
      this.childTitleText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.childContentContainer.addChild(this.childTitleText);

      // Truncated description (smaller font)
      this.childDescText = new Text({
        text: '',
        style: {
          fontSize: 10, // Reduced from 11
          fill: 0x6b7280,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: maxContentWidth
        }
      });
      this.childDescText.anchor.set(0.5, 0);
      this.childDescText.resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      this.childContentContainer.addChild(this.childDescText);

      // Checkbox (slightly smaller) - ISOLATED FROM CLOUD DRAG/FOCUS
      this.childCheckbox = new Graphics();
      this.childCheckbox.eventMode = 'static';
      this.childCheckbox.cursor = 'pointer';

      // Stop ALL propagation to prevent cloud drag and focus
      this.childCheckbox.on('pointerdown', (e) => {
        e.stopPropagation();
      });
      this.childCheckbox.on('pointerup', (e) => {
        e.stopPropagation();
        // Toggle completion on click
        if (this.onCompleteCallback) {
          this.onCompleteCallback();
        }
      });
      this.childCheckbox.on('pointertap', (e) => {
        e.stopPropagation();
      });
      this.childCheckbox.on('click', (e) => {
        e.stopPropagation();
      });

      this.childContentContainer.addChild(this.childCheckbox);

    // Update content
    let title = 'title' in entity ? entity.title : '';
    let desc = 'description' in entity && entity.description ? entity.description : '';

    // Clamp title to 1 line (MAX_CHILD_TITLE_CHARS)
    if (title.length > MAX_CHILD_TITLE_CHARS) {
      title = title.substring(0, MAX_CHILD_TITLE_CHARS - 3) + '...';
    }

    // Clamp description to MAX_CHILD_DESC_CHARS and MAX_CHILD_DESC_LINES
    const maxCharsPerLine = Math.floor(maxContentWidth / Cloud.APPROX_CHAR_WIDTH);
    const maxDescChars = Math.min(MAX_CHILD_DESC_CHARS, maxCharsPerLine * MAX_CHILD_DESC_LINES);
    if (desc.length > maxDescChars) {
      desc = desc.substring(0, maxDescChars - 3) + '...';
    }

    const isCompleted = 'completed' in entity && entity.completed;

    this.childTitleText!.text = title;
    this.childDescText!.text = desc;

    // Draw checkbox (smaller for child nodes)
    const checkSize = 16; // Reduced from 18
    const checkPadding = 4; // Extra padding for easier clicking
    this.childCheckbox!.clear();
    if (isCompleted) {
      // Filled green checkbox with checkmark
      this.childCheckbox!.fill({ color: 0x10b981 });
      this.childCheckbox!.roundRect(-checkSize / 2, -checkSize / 2, checkSize, checkSize, 4);
      // Checkmark
      this.childCheckbox!.stroke({ color: 0xffffff, width: 2 });
      this.childCheckbox!.moveTo(-5, 0);
      this.childCheckbox!.lineTo(-2, 4);
      this.childCheckbox!.lineTo(6, -4);
    } else {
      // Empty checkbox
      this.childCheckbox!.fill({ color: 0xffffff });
      this.childCheckbox!.roundRect(-checkSize / 2, -checkSize / 2, checkSize, checkSize, 4);
      this.childCheckbox!.stroke({ color: 0xd1d5db, width: 2 });
      this.childCheckbox!.roundRect(-checkSize / 2, -checkSize / 2, checkSize, checkSize, 4);
    }

    // CRITICAL: Set explicit hitArea for reliable click detection
    this.childCheckbox!.hitArea = new Rectangle(
      -(checkSize / 2 + checkPadding),
      -(checkSize / 2 + checkPadding),
      checkSize + checkPadding * 2,
      checkSize + checkPadding * 2
    );

    // Layout content top-to-bottom starting at y=0 (relative to container origin)
    const spacing = 8;
    let yPos = 0;

    this.childTitleText!.y = yPos;
    yPos += this.childTitleText!.height + spacing;

    if (desc) {
      this.childDescText!.visible = true;
      this.childDescText!.y = yPos;
      yPos += this.childDescText!.height + spacing;
    } else {
      this.childDescText!.visible = false;
    }

    this.childCheckbox!.y = yPos + checkSize / 2 + 4;

    this.childContentContainer.visible = true;

    // Measure bounds AFTER setting all content (Pixi auto-updates on getLocalBounds)
    const b = this.childContentContainer.getLocalBounds();

    // Center container inside cloud based on measured bounds
    this.childContentContainer.x = -b.x - b.width / 2;
    this.childContentContainer.y = -b.y - b.height / 2;

    // Calculate required interior size (child uses smaller padding)
    const childPaddingX = 30;
    const childPaddingY = 25;
    const requiredW = b.width + childPaddingX * 2;
    const requiredH = b.height + childPaddingY * 2;

    // Compute requiredCoverageR IMMEDIATELY (synchronous, for layout)
    const margin = 15;
    const rx = requiredW / 2 + margin;
    const ry = requiredH / 2 + margin;
    this.requiredCoverageR = Math.max(rx, ry);

    // Compute puff morph targets (cosmetic animation, also sets hit area and animated coverageR)
    this.computeMorphPuffs(requiredW, requiredH);
  }

  private clearChildContent(): void {
    if (this.childContentContainer) {
      // Destroy all children to prevent memory leaks from Text textures
      this.childContentContainer.removeChildren().forEach(child => child.destroy());
      this.childContentContainer.visible = false;
      // Clear references
      this.childTitleText = null;
      this.childDescText = null;
      this.childCheckbox = null;
    }
  }

  private getChildCompletionStats(): { completed: number; total: number } {
    const entity = this.node.entity;
    let completed = 0;
    let total = 0;

    if (this.node.type === 'milestone' && 'tasks' in entity && entity.tasks) {
      total = entity.tasks.length;
      completed = entity.tasks.filter(task => task.completed).length;
    } else if (this.node.type === 'task' && 'subtasks' in entity && entity.subtasks) {
      total = entity.subtasks.length;
      completed = entity.subtasks.filter(subtask => subtask.completed).length;
    }

    return { completed, total };
  }

  private computeMorphPuffs(requiredW: number, requiredH: number): void {
    const margin = 25;
    const parentCoverageRx = requiredW / 2 + margin;
    const parentCoverageRy = requiredH / 2 + margin;
    const parentCoverageR = Math.max(parentCoverageRx, parentCoverageRy);

    // Store coverage radius for orbit calculations
    this.coverageR = parentCoverageR;

    // Select profile based on whether this is focused node or child of focused
    const mode = this.isChildOfFocusedNode ? "child" : "focused";

    // DETERMINISTIC: Create seeded RNG from node ID + mode + size
    const seed = createMorphSeed(this.node.id, mode, requiredW, requiredH);
    const rng = new SeededRandom(seed);

    // Profile A: Focused node (can be larger, more dramatic)
    // Profile B: Child node (tight, cohesive blob with GUARANTEED overlap)
    let totalPuffCount: number;
    let interiorRatio: number;
    let ringDistFactor: number;
    let noiseAmp: number;
    let puffRadiusBase: number;
    let puffRadiusMin: number;
    let puffRadiusMax: number;

    if (mode === "focused") {
      // Profile A: Focused node
      const area = Math.PI * parentCoverageRx * parentCoverageRy;
      totalPuffCount = Math.min(34, Math.max(24, 18 + Math.floor(area / 5500)));
      interiorRatio = 0.80; // 80% interior for better fill
      ringDistFactor = 0.50; // Closer to center for better overlap and coverage
      noiseAmp = 0.20; // Reduced noise for stability
      puffRadiusBase = Math.max(parentCoverageR * 0.27, 18); // Larger base for better coverage
      puffRadiusMin = 14;
      puffRadiusMax = Math.min(parentCoverageR * 0.45, 40);
    } else {
      // Profile B: Child node - COHESIVE BLOB with MANDATORY overlap
      totalPuffCount = Math.max(10, this.basePuffs.length * 2); // More puffs for density
      interiorRatio = 0.65; // 65% interior - very dense
      ringDistFactor = 0.50; // MUCH closer to center for overlap
      noiseAmp = 0.015; // Minimal noise
      puffRadiusBase = Math.max(parentCoverageR * 0.27, 18); // Large puffs relative to size
      puffRadiusMin = Math.max(8, parentCoverageR * 0.15);
      puffRadiusMax = Math.max(16, parentCoverageR * 0.40); // Ensure significant overlap
    }

    const interiorCount = Math.floor(totalPuffCount * interiorRatio);
    const ringCount = totalPuffCount - interiorCount;

    this.targetPuffs = [];

    // Central puff - LARGE for cohesion anchor
    const centerR = mode === "child"
      ? Math.max(puffRadiusMax * 1.2, parentCoverageR * 0.50) // Child: HUGE center
      : Math.min(parentCoverageRx, parentCoverageRy) * 0.45; // Focused: normal
    this.targetPuffs.push({ x: 0, y: 0, r: centerR });

    if (mode === "child") {
      // Child mode: ENFORCE COHESIVE BLOB with guaranteed overlap
      const actualRingCount = Math.min(4, ringCount);

      // Ring puffs: MUST overlap with center and each other
      for (let i = 0; i < actualRingCount; i++) {
        const angle = (i / actualRingCount) * Math.PI * 2;
        const noise = (rng.next() - 0.5) * noiseAmp;
        const distFactor = ringDistFactor + noise;

        // Calculate position ensuring overlap with center
        const dist = parentCoverageR * distFactor;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;

        // Puff radius with variance for more organic look
        const pr = Math.max(puffRadiusMin, Math.min(puffRadiusMax, puffRadiusBase * 1.2 * (0.70 + rng.next() * 0.60)));

        // Clamp: ensure puff doesn't extend beyond coverage radius
        const maxAllowedR = parentCoverageR - dist + pr * 0.5;
        const finalR = Math.min(pr, maxAllowedR);

        this.targetPuffs.push({ x: px, y: py, r: Math.max(puffRadiusMin, finalR) });
      }

      // Interior puffs: HEAVILY center-biased for maximum density
      const actualInteriorCount = totalPuffCount - actualRingCount - 1;
      for (let i = 0; i < actualInteriorCount; i++) {
        const angle = rng.next() * Math.PI * 2;
        // sqrt creates center-heavy distribution, reduced factor for tighter clustering
        const dist = Math.sqrt(rng.next()) * 0.50; // 0.50 = very tight
        const interiorDist = parentCoverageR * dist;
        const interiorR = Math.max(puffRadiusMin, Math.min(puffRadiusMax, puffRadiusBase * (0.60 + rng.next() * 0.80)));
        this.targetPuffs.push({
          x: Math.cos(angle) * interiorDist,
          y: Math.sin(angle) * interiorDist,
          r: interiorR
        });
      }
    } else {
      // Focused mode: standard distribution with deterministic RNG
      for (let i = 0; i < ringCount - 1; i++) {
        const angle = (i / (ringCount - 1)) * Math.PI * 2;
        const noise = (rng.next() - 0.5) * noiseAmp;
        const distFactor = ringDistFactor + noise;
        const dist = parentCoverageR * distFactor;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        const pr = Math.max(puffRadiusMin, Math.min(puffRadiusMax, puffRadiusBase * (0.70 + rng.next() * 0.60)));
        this.targetPuffs.push({ x: px, y: py, r: pr });
      }

      // Corner anchor puffs at ~45° angles for rectangular content coverage
      const cornerAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
      for (const angle of cornerAngles) {
        const cornerDist = parentCoverageR * 0.50;
        const cornerR = puffRadiusBase * (0.85 + rng.next() * 0.30);
        this.targetPuffs.push({
          x: Math.cos(angle) * cornerDist,
          y: Math.sin(angle) * cornerDist,
          r: Math.max(puffRadiusMin, Math.min(puffRadiusMax, cornerR))
        });
      }

      // Interior puffs for density - use seeded RNG
      for (let i = 0; i < interiorCount; i++) {
        const angle = rng.next() * Math.PI * 2;
        const dist = Math.sqrt(rng.next()) * 0.55; // Center-biased
        const interiorDist = parentCoverageR * dist;
        const interiorR = Math.max(puffRadiusMin, Math.min(puffRadiusMax, puffRadiusBase * (0.60 + rng.next() * 0.80)));
        this.targetPuffs.push({
          x: Math.cos(angle) * interiorDist,
          y: Math.sin(angle) * interiorDist,
          r: interiorR
        });
      }
    }

    // Set hit area
    this.hitArea = new Ellipse(0, 0, parentCoverageRx, parentCoverageRy);

    // Mark morph as incomplete to trigger interpolation
    this.morphComplete = false;
  }

  public update(deltaTime: number, frameTime?: number): void {
    // Use shared timestamp to avoid multiple Date.now() calls per frame
    const now = frameTime ?? Date.now();

    // Handle spawn animation (pop in with easeOutBack)
    if (this.isSpawning) {
      const elapsed = now - this.spawnStartTime;
      this.spawnProgress = Math.min(1, elapsed / CLOUD.SPAWN_DURATION_MS);

      if (this.spawnProgress >= 1) {
        this.isSpawning = false;
        this.spawnProgress = 1;
      }

      // Apply easeOutBack for bouncy pop-in effect
      const easedSpawn = this.easeOutBack(this.spawnProgress);
      this.scale.set(easedSpawn);
      this.alpha = this.spawnProgress; // Fade in linearly

      // Still update position during spawn
      const posSpeed = 0.2;
      this.x += (this.node.x - this.x) * posSpeed * deltaTime;
      this.y += (this.node.y - this.y) * posSpeed * deltaTime;
      return;
    }

    // Handle dissolve animation
    if (this.dissolving) {
      // deltaTime is in frames (60fps assumed), convert to ms progress
      const msPerFrame = 1000 / 60;
      this.dissolveProgress += (deltaTime * msPerFrame) / this.dissolveDuration;

      // Update particles during dissolve
      this.updateParticles(deltaTime);

      if (this.dissolveProgress >= 1) {
        this.dissolveProgress = 1;
        this.dissolving = false;
        if (this.dissolveCallback) {
          this.dissolveCallback();
          this.dissolveCallback = null;
        }
      }

      // Dissolve effect: scale up slightly while fading out
      const eased = this.easeOutCubic(this.dissolveProgress);
      this.alpha = 1 - eased;
      this.scale.set(1 + eased * 0.3);

      // Float upward slightly during dissolve
      this.y -= deltaTime * 0.5;
      return;
    }

    // Don't update position from node while dragging
    if (this.dragging) {
      // Keep scale elevated while dragging - grow more in danger or complete zone
      const zoneIntensity = Math.max(this.dangerLevel, this.completeLevel);
      const targetDragScale = 1.1 + zoneIntensity * 0.15;
      this.currentScale += (targetDragScale - this.currentScale) * 0.2 * deltaTime;
      this.scale.set(this.currentScale);

      // Add wobble effect when in danger zone (not complete zone)
      if (this.dangerLevel > 0.5) {
        const wobble = Math.sin(now * 0.02) * this.dangerLevel * 3;
        this.rotation = wobble * 0.05;
      } else {
        this.rotation *= 0.9; // Smooth return to no rotation
      }

      // Handle zone visual changes - complete and danger are mutually exclusive
      const dangerChanged = Math.abs(this.dangerLevel - this.lastDrawnDangerLevel) > CLOUD.REDRAW_THRESHOLD;
      const completeChanged = Math.abs(this.completeLevel - this.lastDrawnCompleteLevel) > CLOUD.REDRAW_THRESHOLD;

      if (dangerChanged || completeChanged) {
        this.lastDrawnDangerLevel = this.dangerLevel;
        this.lastDrawnCompleteLevel = this.completeLevel;
        this.drawCloud({ dangerLevel: this.dangerLevel, completeLevel: this.completeLevel, frameTime: now });
      }
      return;
    }

    // Apply gentle wobble for neglected clouds (design brief: "wobble slightly")
    if (this.neglectLevel > 0.5) {
      const wobbleStrength = (this.neglectLevel - 0.5) * 2; // 0-1 when neglect is 0.5-1.0
      const wobble = Math.sin(now * 0.005) * wobbleStrength * 0.02;
      this.rotation = wobble;
    } else {
      // Reset rotation when not neglected
      this.rotation *= 0.9;
    }

    // Smooth scale interpolation
    const scaleSpeed = 0.15;
    const targetScaleWithHighlight = this.highlightAsDropTarget
      ? Math.max(this.targetScale, 1.2)
      : this.targetScale;
    this.currentScale += (targetScaleWithHighlight - this.currentScale) * scaleSpeed * deltaTime;

    // Apply gentle breathing animation (subtle scale oscillation)
    const breatheSpeed = 0.001; // Slow oscillation
    const breatheAmount = 0.02; // 2% scale variation
    const breathe = 1 + Math.sin(now * breatheSpeed + this.breatheOffset) * breatheAmount;
    this.scale.set(this.currentScale * breathe);

    // Smooth alpha interpolation
    const alphaSpeed = 0.1;
    this.alpha += (this.targetAlpha - this.alpha) * alphaSpeed * deltaTime;

    // Smooth puff morph animation - skip if already complete
    if (!this.morphComplete) {
      // PERF: Faster morph speed for snappy, responsive animations
      const morphSpeed = 0.25;
      let puffsChanged = false;
      let allSettled = true;

      // Handle puff count changes first (add new puffs with animation from center)
      while (this.currentPuffs.length < this.targetPuffs.length) {
        this.currentPuffs.push({ x: 0, y: 0, r: 0 }); // Start from center
        puffsChanged = true;
        allSettled = false;
      }

      // Remove excess puffs
      while (this.currentPuffs.length > this.targetPuffs.length) {
        this.currentPuffs.pop();
        puffsChanged = true;
      }

      // Interpolate current puffs toward target puffs
      for (let i = 0; i < this.currentPuffs.length; i++) {
        const current = this.currentPuffs[i];
        const target = this.targetPuffs[i] || this.basePuffs[i % this.basePuffs.length];

        const dx = Math.abs(current.x - target.x);
        const dy = Math.abs(current.y - target.y);
        const dr = Math.abs(current.r - target.r);

        // Use smaller threshold for faster settling
        if (dx > 0.3 || dy > 0.3 || dr > 0.3) {
          current.x += (target.x - current.x) * morphSpeed * deltaTime;
          current.y += (target.y - current.y) * morphSpeed * deltaTime;
          current.r += (target.r - current.r) * morphSpeed * deltaTime;
          puffsChanged = true;
          allSettled = false;
        }
      }

      // Mark morph as complete when all puffs have settled
      if (allSettled) {
        this.morphComplete = true;
      }

      if (puffsChanged) {
        // Redraw cloud with morphed puffs
        this.drawCloud({
          dangerLevel: this.dangerLevel,
          completeLevel: this.completeLevel,
          frameTime: now
        });
      }
    }

    // Update position from node (gentle return to home anchor)
    const posSpeed = 0.2;
    this.x += (this.node.x - this.x) * posSpeed * deltaTime;
    this.y += (this.node.y - this.y) * posSpeed * deltaTime;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private easeOutBack(t: number): number {
    const c1 = CLOUD.EASE_OUT_BACK_OVERSHOOT;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  private spawnParticles(): void {
    const r = this.node.radius;

    for (let i = 0; i < ANIMATION.PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = ANIMATION.PARTICLE_SPEED * (0.5 + Math.random());
      const distFromCenter = Math.random() * r * 0.6;

      // Acquire particle from pool instead of creating new object
      const p = ParticlePool.acquire();
      p.x = Math.cos(angle) * distFromCenter;
      p.y = Math.sin(angle) * distFromCenter;
      p.vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 0.5;
      p.vy = Math.sin(angle) * speed - Math.random() * 1.5; // Slight upward bias
      p.radius = ANIMATION.PARTICLE_SIZE_MIN +
        Math.random() * (ANIMATION.PARTICLE_SIZE_MAX - ANIMATION.PARTICLE_SIZE_MIN);
      p.alpha = 0.8 + Math.random() * 0.2;
      p.lifetime = 0;
      p.maxLifetime = ANIMATION.PARTICLE_LIFETIME_MS * (0.7 + Math.random() * 0.6);

      this.particles.push(p);
    }
  }

  private updateParticles(deltaTime: number): void {
    const msPerFrame = 1000 / 60;

    this.particleGraphics.clear();

    // Get cloud color for particles
    const colors = this.getCloudColor();

    // Update and draw particles, releasing expired ones back to pool
    this.particles = this.particles.filter((p) => {
      p.lifetime += deltaTime * msPerFrame;
      if (p.lifetime >= p.maxLifetime) {
        ParticlePool.release(p);  // Return to pool for reuse
        return false;
      }

      // Apply gravity and movement
      p.vy -= 0.02 * deltaTime; // Gentle float upward
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      // Fade out over lifetime
      const lifeRatio = p.lifetime / p.maxLifetime;
      const alpha = p.alpha * (1 - lifeRatio);

      // Shrink slightly over time
      const size = p.radius * (1 - lifeRatio * 0.5);

      // Draw particle as soft circle
      this.particleGraphics.fill({ color: colors.main, alpha });
      this.particleGraphics.circle(p.x, p.y, size);
      this.particleGraphics.fill();

      return true;
    });
  }

  public dissolve(callback?: () => void): void {
    if (this.dissolving) return;

    this.dissolving = true;
    this.dissolveProgress = 0;
    this.dissolveCallback = callback || null;
    this.dissolveDuration = this.node.type === 'milestone'
      ? ANIMATION.DISSOLVE_MILESTONE_MS
      : ANIMATION.DISSOLVE_TASK_MS;

    // Spawn particles at start of dissolve
    this.spawnParticles();
  }

  public isDissolving(): boolean {
    return this.dissolving;
  }

  /**
   * Check if this cloud has any active animation (spawn, dissolve, morph)
   * PERF: Used by idle detection to prevent frame skipping during animations
   */
  public isAnimating(): boolean {
    return this.isSpawning || this.dissolving || !this.morphComplete;
  }

  public updateNode(node: CloudNode): void {
    this.node = node;

    // Update label (but only if not in focus mode - label hidden in focus)
    const title = this.getTitle();
    if (this.cloudLabel.text !== title) {
      this.cloudLabel.text = title;
    }

    // CRITICAL: If cloud is currently focused or child-of-focused, recompute content and morph
    // This ensures focus visuals survive CRUD operations (e.g., adding task, editing title)
    if (this.isFocusedNode) {
      // Recompute focused content (text, bounds, requiredCoverageR, targetPuffs)
      this.layoutFocusedContent();
      this.drawCloud(); // Redraw with new morph
    } else if (this.isChildOfFocusedNode) {
      // Recompute child content (title, desc, checkbox, bounds, requiredCoverageR, targetPuffs)
      this.layoutChildContent();
      this.drawCloud(); // Redraw with new morph
    } else {
      // Normal mode - just redraw base cloud
      this.drawCloud();
    }
  }

  public getType(): EntityType {
    return this.node.type;
  }

  public getId(): string {
    return this.node.id;
  }

  /**
   * Check if a Pixi event target is the checkbox or a descendant of it.
   * Used to prevent drag/focus when clicking checkbox.
   */
  public isCheckboxEventTarget(target: any): boolean {
    if (!target || !this.childCheckbox) return false;

    // Direct match
    if (target === this.childCheckbox) return true;

    // Walk up parent chain to check for checkbox ancestor
    let current = target;
    while (current) {
      if (current === this.childCheckbox) return true;
      current = current.parent;
      // Safety: stop at root or after reasonable depth
      if (!current || current === this) break;
    }

    return false;
  }

  // Drag methods
  public startDrag(globalX: number, globalY: number): void {
    this.dragging = true;
    this.dragOffsetX = this.x - globalX;
    this.dragOffsetY = this.y - globalY;
    this.homeAnchorX = this.node.x;
    this.homeAnchorY = this.node.y;
    this.cursor = 'grabbing';
    this.zIndex = 1000; // Bring to front while dragging
  }

  public updateDrag(globalX: number, globalY: number): void {
    if (!this.dragging) return;
    this.x = globalX + this.dragOffsetX;
    this.y = globalY + this.dragOffsetY;
  }

  public endDrag(): { x: number; y: number } {
    this.dragging = false;
    this.cursor = 'pointer';
    this.zIndex = 0;
    this.dangerLevel = 0;
    this.completeLevel = 0;
    this.lastDrawnCompleteLevel = 0;
    this.rotation = 0;
    this.drawCloud(); // Reset to normal appearance
    return { x: this.x, y: this.y };
  }

  public setDangerLevel(level: number): void {
    this.dangerLevel = Math.max(0, Math.min(1, level));
  }

  public setCompleteLevel(level: number): void {
    const newLevel = Math.max(0, Math.min(1, level));
    if (Math.abs(newLevel - this.lastDrawnCompleteLevel) > CLOUD.REDRAW_THRESHOLD) {
      this.completeLevel = newLevel;
      this.lastDrawnCompleteLevel = newLevel;
      if (this.dragging && this.completeLevel > 0) {
        this.drawCloud({ completeLevel: this.completeLevel });
      }
    }
  }

  public setNeglectLevel(level: number): void {
    const newLevel = Math.max(0, Math.min(1, level));
    // Only update and redraw if change exceeds threshold (cached redraw)
    if (Math.abs(newLevel - this.lastDrawnNeglectLevel) > CLOUD.REDRAW_THRESHOLD) {
      this.neglectLevel = newLevel;
      this.lastDrawnNeglectLevel = newLevel;
      // Redraw cloud with neglect effects if not being dragged
      if (!this.dragging && this.dangerLevel === 0) {
        this.drawCloud({ neglectLevel: this.neglectLevel });
      }
    }
  }

  public isDragging(): boolean {
    return this.dragging;
  }

  public getHomeAnchor(): { x: number; y: number } {
    return { x: this.homeAnchorX, y: this.homeAnchorY };
  }

  public setDropTargetHighlight(highlight: boolean): void {
    this.highlightAsDropTarget = highlight;
    // Redraw with highlight state
    this.drawCloud({ highlightLevel: highlight ? 1 : 0 });
  }

  public canAcceptDrop(draggedCloud: Cloud): boolean {
    // Don't accept if dropping on current parent (no-op)
    if (draggedCloud.node.parentId === this.node.id) {
      return false;
    }

    // Milestones can accept tasks
    if (this.node.type === 'milestone' && draggedCloud.node.type === 'task') {
      return true;
    }
    // Tasks can accept subtasks
    if (this.node.type === 'task' && draggedCloud.node.type === 'subtask') {
      return true;
    }
    // Milestones can accept subtasks (will convert to task)
    if (this.node.type === 'milestone' && draggedCloud.node.type === 'subtask') {
      return true;
    }
    return false;
  }

  public destroy(): void {
    // Release particles back to pool before clearing
    ParticlePool.releaseAll(this.particles);
    this.particles = [];
    this.particleGraphics.clear();

    // Remove all event listeners from this container
    this.removeAllListeners();

    // Destroy graphics objects
    this.cloudGraphics.destroy();
    this.particleGraphics.destroy();
    this.cloudLabel.destroy();

    // Clean up focus complete button (has event listeners)
    if (this.focusCompleteButton) {
      this.focusCompleteButton.removeAllListeners();
    }

    // Clean up focus content container
    if (this.focusContentContainer) {
      this.focusContentContainer.destroy({ children: true });
      this.focusContentContainer = null;
      this.focusTitleText = null;
      this.focusDescText = null;
      this.focusDueDateText = null;
      this.focusProgressText = null;
      this.focusCompleteButton = null;
      this.focusCompleteButtonBg = null;
      this.focusCompleteButtonText = null;
    }

    // Clean up child checkbox (has event listeners)
    if (this.childCheckbox) {
      this.childCheckbox.removeAllListeners();
    }

    // Clean up child content container
    if (this.childContentContainer) {
      this.childContentContainer.destroy({ children: true });
      this.childContentContainer = null;
      this.childTitleText = null;
      this.childDescText = null;
      this.childCheckbox = null;
    }

    // Clear callback reference
    this.onCompleteCallback = null;

    // Call parent destroy
    super.destroy({ children: true });
  }
}
