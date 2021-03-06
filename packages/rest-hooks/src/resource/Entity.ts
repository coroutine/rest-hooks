import { AbstractInstanceType } from 'rest-hooks/types';
import { NotImplementedError } from 'rest-hooks/errors';

import { Schema, schemas } from './normal';
import SimpleRecord from './SimpleRecord';

/** Represents data that should be deduped by specifying a primary key. */
export default abstract class Entity extends SimpleRecord {
  /**
   * A unique identifier for each Entity
   *
   * @param [parent] When normalizing, the object which included the entity
   * @param [key] When normalizing, the key where this entity was found
   */
  abstract pk(parent?: any, key?: string): string | undefined;

  /** Returns the globally unique identifier for the static Entity */
  static get key(): string {
    throw new NotImplementedError();
  }

  // TODO: add 'declare' once babel supports 'declare static' syntax
  /** Defines nested entities */
  static schema: { [k: string]: Schema } = {};

  /** Defines indexes to enable lookup by */
  static indexes?: string[];

  /**
   * A unique identifier for each Entity
   *
   * @param [value] POJO of the entity or subset used
   * @param [parent] When normalizing, the object which included the entity
   * @param [key] When normalizing, the key where this entity was found
   */
  static pk<T extends typeof Entity>(
    this: T,
    value: Partial<AbstractInstanceType<T>>,
    parent?: any,
    key?: string,
  ): string | undefined {
    return this.prototype.pk.call(value, parent, key) || key;
  }

  /** Returns this to be used in a schema definition.
   * This is essential to capture the correct type to be used in inferencing.
   */
  static asSchema<T extends typeof Entity>(this: T) {
    return this as EntitySchema<T>;
  }

  static normalize(
    input: Partial<Entity>,
    parent: any,
    key: string | undefined,
    visit: Function,
    addEntity: Function,
    visitedEntities: Record<string, any>,
  ) {
    const id = this.pk(input, parent, key);
    /* istanbul ignore next */
    if (id === undefined) {
      if (process.env.NODE_ENV !== 'production' && id === undefined) {
        throw new Error(
          `Missing usable resource key when normalizing response.

  This is likely due to a malformed response.
  Try inspecting the network response or fetch() return value.

  Entity: ${this}
  Value: ${input && JSON.stringify(input, null, 2)}
  `,
        );
      } else {
        throw new Error('undefined pk');
      }
    }
    const entityType = this.key;

    if (!(entityType in visitedEntities)) {
      visitedEntities[entityType] = {};
    }
    if (!(id in visitedEntities[entityType])) {
      visitedEntities[entityType][id] = [];
    }
    if (
      visitedEntities[entityType][id].some((entity: any) => entity === input)
    ) {
      return id;
    }
    visitedEntities[entityType][id].push(input);

    // TODO: what's store needs to be a differing type from fromJS
    const processedEntity: any = this.fromJS(input, parent, key);
    Object.keys(this.schema).forEach(key => {
      if (
        Object.hasOwnProperty.call(processedEntity, key) &&
        typeof processedEntity[key] === 'object'
      ) {
        const schema = this.schema[key];
        processedEntity[key] = visit(
          processedEntity[key],
          processedEntity,
          key,
          schema,
          addEntity,
          visitedEntities,
        );
      }
    });

    addEntity(this, processedEntity, input, parent, key);
    return id;
  }

  // TODO: Add denormalizing capability
  static denormalize<T extends typeof Entity>(
    this: T,
    entity: AbstractInstanceType<T> | undefined,
    unvisit: schemas.UnvisitFunction,
  ): [AbstractInstanceType<T>, true] {
    return [entity, true] as any;
  }

  // backwards compatible with normalizr
  /** Calls pk
   *
   * @param params
   * @param parent
   * @param key
   */
  static getId(params: any, parent?: any, key?: string) {
    return this.pk(params, parent, key);
  }

  /** Add nested entities */
  static define(definition: { [k: string]: Schema }) {
    /* istanbul ignore next */
    if (process.env.NODE_ENV === 'development') {
      console.error(
        'Entity.define() is deprecated - override Entity.schema instead.',
      );
    }
    /* istanbul ignore next */
    this.schema = Object.keys(definition).reduce((entitySchema, key) => {
      const schema = definition[key];
      return { ...entitySchema, [key]: schema };
    }, this.schema || {});
  }
}

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'production') {
  // for those not using TypeScript this is a good catch to ensure they are defining
  // the abstract members
  Entity.fromJS = function fromJS<T extends typeof SimpleRecord>(
    this: T,
    props: Partial<AbstractInstanceType<T>>,
  ): Readonly<AbstractInstanceType<T>> {
    if ((this as any).prototype.pk === undefined)
      throw new Error('cannot construct on abstract types');
    return SimpleRecord.fromJS.call(this, props) as any;
  };
}

export type EntitySchema<E extends typeof Entity> = E & {
  normalize(
    input: any,
    parent: any,
    key: any,
    visit: Function,
    addEntity: Function,
    visitedEntities: Record<string, any>,
  ): string;
  denormalize(
    entity: any,
    unvisit: Function,
  ): [AbstractInstanceType<E>, boolean];
  _normalizeNullable(): string | undefined;
  _denormalizeNullable(): [AbstractInstanceType<E> | undefined, boolean];
};
