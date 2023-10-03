/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Edge,
  NodeValue,
  GraphDescriptor,
  InputValues,
  KitDescriptor,
  NodeDescriptor,
  NodeHandlers,
  NodeTypeIdentifier,
  OutputValues,
  Capability,
  TraversalResult,
} from "@google-labs/graph-runner";

export interface Kit extends KitDescriptor {
  get handlers(): NodeHandlers;
}

export type BreadboardSlotSpec = Record<string, GraphDescriptor>;

export type RunResultType = "input" | "output" | "beforehandler";

export interface BreadboardRunResult {
  /**
   * Type of the run result. This property indicates where the board
   * currently is in the `run` process.
   */
  type: RunResultType;
  /**
   * The current node that is being visited. This property can be used to get
   * information about the current node, such as its id, type, and
   * configuration.
   */
  node: NodeDescriptor;
  /**
   * Any arguments that were passed to the `input` node that triggered this
   * stage.
   * Usually contains `message` property, which is a friendly message
   * to the user about what input is expected.
   * This property is only available when `ResultRunType` is `input`.
   */
  get inputArguments(): InputValues;
  /**
   * The input values the board is waiting for.
   * Set this property to provide input values.
   * This property is only available when `ResultRunType` is `input`.
   */
  set inputs(input: InputValues);
  /**
   * the output values the board is providing.
   * This property is only available when `ResultRunType` is `output`.
   */
  get outputs(): OutputValues;
  /**
   * Current state of the underlying graph traversal.
   * This property is useful for saving and restoring the state of
   * graph traversal.
   */
  get state(): TraversalResult;
}

export interface NodeFactory {
  create<Inputs, Outputs>(
    kit: Kit | undefined,
    type: NodeTypeIdentifier,
    configuration?: NodeConfigurationConstructor,
    id?: string
  ): BreadboardNode<Inputs, Outputs>;
  getConfigWithLambda<Inputs, Outputs>(
    config: ConfigOrLambda<Inputs, Outputs>
  ): OptionalIdConfiguration;
}

export interface KitConstructor<T extends Kit> {
  new (nodeFactory: NodeFactory): T;
}

type Key = string | symbol | number;

export type GenericKit<T extends readonly Key[]> = Kit & {
  [key in T[number]]: <In = unknown, Out = unknown>(
    config?: OptionalIdConfiguration
  ) => BreadboardNode<In, Out>;
};

/**
 * Validator metadata for a node.
 * Used e.g. in ProbeDetails.
 */
export interface BreadboardValidatorMetadata {
  description: string;
}

/**
 * A validator for a breadboard.
 * For example to check integrity using information flow control.
 */
export interface BreadboardValidator {
  /**
   * Add a graph and validate it.
   *
   * @param graph The graph to validate.
   * @throws Error if the graph is invalid.
   */
  addGraph(graph: GraphDescriptor): void;

  /**
   * Gets the validation metadata for a node.
   *
   * @param node Node to get metadata for.
   */
  getValidatorMetadata(node: NodeDescriptor): BreadboardValidatorMetadata;

  /**
   * Generate a validator for a subgraph, replacing a given node. Call
   * .addGraph() on the returned validator to add and validate the subgraph.
   *
   * @param node The node to replace.
   * @param actualInputs Actual inputs to the node (as opposed to assuming all
   * inputs with * or that optional ones are present)
   * @returns A validator for the subgraph.
   */
  getSubgraphValidator(
    node: NodeDescriptor,
    actualInputs?: string[]
  ): BreadboardValidator;
}

/**
 * Details of the `ProbeEvent` event.
 */
export interface ProbeDetails {
  /**
   * Internal representation of the node that is placed on the board.
   */
  descriptor: NodeDescriptor;
  /**
   * The input values the node was passed.
   */
  inputs: InputValues;
  /**
   * Any missing inputs that the node was expecting.
   * This property is only populated for `skip` event.
   */
  missingInputs?: string[];
  /**
   * The output values the node provided.
   */
  outputs?: OutputValues | Promise<OutputValues>;
  /**
   * The nesting level of the node.
   * When a board contains included or slotted boards, this level will
   * increment for each level of nesting.
   */
  nesting?: number;
  sources?: string[];
  validatorMetadata?: BreadboardValidatorMetadata[];
}

/**
 * A probe event that is distpached during board run.
 *
 * See [Chapter 7: Probes](https://github.com/google/labs-prototypes/tree/main/seeds/breadboard/docs/tutorial#chapter-7-probes) for more information.
 */
export type ProbeEvent = CustomEvent<ProbeDetails>;

export interface BreadboardRunner extends GraphDescriptor {
  kits: Kit[]; // No longer optional
  run(
    probe?: EventTarget,
    slots?: BreadboardSlotSpec,
    result?: BreadboardRunResult
  ): AsyncGenerator<BreadboardRunResult>;
  runOnce(
    inputs: InputValues,
    probe?: EventTarget,
    slots?: BreadboardSlotSpec
  ): Promise<OutputValues>;
  addValidator(validator: BreadboardValidator): void;
}

export interface Breadboard extends BreadboardRunner {
  passthrough<In = InputValues, Out = OutputValues>(
    config?: OptionalIdConfiguration
  ): BreadboardNode<In, Out>;
  input<In = InputValues, Out = OutputValues>(
    config?: OptionalIdConfiguration
  ): BreadboardNode<In, Out>;
  output<In = InputValues, Out = OutputValues>(
    config?: OptionalIdConfiguration
  ): BreadboardNode<In, Out>;
  lambda<In, InL extends In, OutL = OutputValues>(
    boardOrFunction: LambdaFunction<InL, OutL> | BreadboardRunner,
    config?: OptionalIdConfiguration
  ): BreadboardNode<In, LambdaNodeOutputs>;
  include<In = InputValues, Out = OutputValues>(
    $ref: string | GraphDescriptor | BreadboardCapability,
    config?: OptionalIdConfiguration
  ): BreadboardNode<IncludeNodeInputs & In, Out>;
  reflect(
    config?: OptionalIdConfiguration
  ): BreadboardNode<never, ReflectNodeOutputs>;
  slot<In = InputValues, Out = OutputValues>(
    slot: string,
    config?: OptionalIdConfiguration
  ): BreadboardNode<SlotNodeInputs & In, Out>;

  addEdge(edge: Edge): void;
  addNode(node: NodeDescriptor): void;
  addKit<T extends Kit>(ctr: KitConstructor<T>): T;
  currentBoardToAddTo(): Breadboard;
}

export type BreadboardCapability = Capability & {
  kind: "board";
  board: GraphDescriptor;
};

type Common<To, From> = {
  [P in keyof (From | To) as From[P] extends To[P] ? P : never]?:
    | To[P]
    | undefined;
};

type LongOutSpec<From, To> =
  | `${string & keyof From}->${string & keyof To}`
  | `${string & keyof From}->${string & keyof To}.`
  | `${string & keyof From}->${string & keyof To}?`;

type LongInSpec<From, To> =
  | `${string & keyof From}<-${string & keyof To}`
  | `${string & keyof From}<-${string & keyof To}.`
  | `${string & keyof From}<-${string & keyof To}?`;

type ShortOutSpec<From, To> =
  | `${string & keyof Common<From, To>}`
  | `${string & keyof Common<From, To>}->`
  | `${string & keyof Common<From, To>}->.`
  | `${string & keyof Common<From, To>}->?`;

type ShortInSpec<From, To> =
  | `<-${string & keyof Common<From, To>}`
  | `<-${string & keyof Common<From, To>}.`
  | `<-${string & keyof Common<From, To>}?`;

export type WireOutSpec<From, To> =
  | LongOutSpec<From, To>
  | ShortOutSpec<From, To>;

export type WireInSpec<From, To> = LongInSpec<From, To> | ShortInSpec<From, To>;

export type WireSpec<FromIn, FromOut, ToIn, ToOut> =
  | WireOutSpec<FromOut, ToIn>
  | WireInSpec<ToOut, FromIn>;

export interface BreadboardNode<Inputs, Outputs> {
  /**
   * Wires the current node to another node.
   *
   * Use this method to wire nodes together.
   *
   * @param spec - the wiring spec. See the [wiring spec](https://github.com/google/labs-prototypes/blob/main/seeds/breadboard/docs/wires.md) for more details.
   * @param to - the node to wire this node with.
   * @returns - the current node, to enable chaining.
   */
  wire<ToInputs, ToOutputs>(
    // spec: WireSpec<Inputs, Outputs, ToInputs, ToOutputs>,
    spec: string,
    to: BreadboardNode<ToInputs, ToOutputs>
  ): BreadboardNode<Inputs, Outputs>;
}

/**
 * A node configuration that can optionally have an `$id` property.
 *
 * The `$id` property is used to identify the node in the board and is not
 * passed to the node itself.
 */
export type OptionalIdConfiguration = {
  $id?: string;
} & NodeConfigurationConstructor;

/**
 * A node configuration that optionally has nodes as values. The Node()
 * constructor will remove those and turn them into wires into the node instead.
 */
export type NodeConfigurationConstructor = Record<
  string,
  NodeValue | BreadboardNode<InputValues, OutputValues>
>; // extends NodeConfiguration

/**
 * Synctactic sugar for node factories that accept lambdas. This allows passing
 * either
 *  - A JS function that is a lambda function defining the board
 *  - A board capability, i.e. the result of calling lambda()
 *  - A board node, which should be a node with a `board` output
 * or
 *  - A regular config, with a `board` property with any of the above.
 *
 * use `getConfigWithLambda()` to turn this into a regular config.
 */
export type ConfigOrLambda<In, Out> =
  | OptionalIdConfiguration
  | BreadboardCapability
  | BreadboardNode<LambdaNodeInputs, LambdaNodeOutputs>
  | LambdaFunction<In, Out>
  | {
      board:
        | BreadboardCapability
        | BreadboardNode<LambdaNodeInputs, LambdaNodeOutputs>
        | LambdaFunction<In, Out>;
    };

export type LambdaFunction<In = InputValues, Out = OutputValues> = (
  board: Breadboard,
  input: BreadboardNode<In, Out>,
  output: BreadboardNode<In, Out>
) => void;

export type ReflectNodeOutputs = OutputValues & {
  graph: GraphDescriptor;
};

export type LambdaNodeInputs = InputValues & {
  /**
   * The (lambda) board this node represents. The purpose of the this node is to
   * allow wiring data into the lambda board, outside of where it's called.
   * This is useful when passing a lambda to a map node or as a slot.
   *
   * Note that (for now) each board can only be represented by one node.
   */
  board: BreadboardCapability;

  /**
   * All other inputs will be bound to the board.
   */
  args: InputValues;
};

export type LambdaNodeOutputs = OutputValues & {
  /**
   * The lambda board that can be run.
   */
  board: BreadboardCapability;
};

export type ImportNodeInputs = InputValues & {
  path?: string;
  $ref?: string;
  graph?: GraphDescriptor;
  args: InputValues;
};

export type IncludeNodeInputs = InputValues & {
  path?: string;
  $ref?: string;
  board?: BreadboardCapability;
  graph?: GraphDescriptor;
  slotted?: BreadboardSlotSpec;
  parent: NodeDescriptor;
  args: InputValues;
};

export type SlotNodeInputs = {
  slot: string;
  parent: NodeDescriptor;
};

export type KitImportMap = Record<string, KitConstructor<Kit>>;
