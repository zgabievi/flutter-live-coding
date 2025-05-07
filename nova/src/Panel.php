<?php

namespace Laravel\Nova;

use Illuminate\Http\Resources\ConditionallyLoadsAttributes;
use Illuminate\Http\Resources\MergeValue;
use Illuminate\Http\Resources\MissingValue;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Support\Traits\Macroable;
use Illuminate\Support\Traits\Tappable;
use JsonSerializable;
use Laravel\Nova\Contracts\RelatableField;
use Laravel\Nova\Exceptions\NovaException;
use Laravel\Nova\Fields\Collapsable;
use Laravel\Nova\Fields\FieldCollection;
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Metrics\HasHelpText;
use Stringable;

/**
 * @phpstan-import-type TFields from \Laravel\Nova\Resource
 * @phpstan-import-type TPanelFields from \Laravel\Nova\Tabs\TabsGroup
 *
 * @property array<int, TFields>|null $data
 *
 * @method static static make(\Stringable|string $name, callable|iterable $fields = [], ?string $attribute = null)
 */
#[\AllowDynamicProperties]
class Panel extends MergeValue implements JsonSerializable, Stringable
{
    use Collapsable;
    use ConditionallyLoadsAttributes;
    use HasHelpText;
    use Macroable;
    use Makeable;
    use Metable;
    use Tappable;
    use WithComponent;

    /**
     * The name of the panel.
     *
     * @var \Stringable|string
     */
    public $name;

    /**
     * The unique identifier of the panel.
     *
     * @var string
     */
    public $attribute;

    /**
     * The panel's component.
     *
     * @var string
     */
    public $component = 'panel';

    /**
     * Indicates whether the detail toolbar should be visible on this panel.
     *
     * @var bool
     */
    public $showToolbar = false;

    /**
     * The initial field display limit.
     *
     * @var int|null
     */
    public $limit = null;

    /**
     * Create a new panel instance.
     *
     * @param  \Stringable|string  $name
     * @param  (callable():(iterable))|iterable  $fields
     * @return void
     *
     * @phpstan-param (callable():(TPanelFields))|TPanelFields $fields
     */
    public function __construct($name, callable|iterable $fields = [], ?string $attribute = null)
    {
        $this->name = $name;
        $this->attribute = $attribute ?? Str::slug($name);

        parent::__construct($this->prepareFields($fields));
    }

    /**
     * Create a new default panel instance.
     *
     * @param  \Stringable|string  $name
     * @param  (callable():(iterable))|iterable  $fields
     * @return static
     *
     * @phpstan-param (callable():(TPanelFields))|TPanelFields $fields
     */
    public static function makeDefault($name, callable|iterable $fields = [], ?string $attribute = null)
    {
        return static::make($name, $fields, $attribute)->withMeta(['fields' => $fields]);
    }

    /**
     * Mutate new panel from list of fields.
     *
     * @param  \Stringable|string  $name
     * @param  \Laravel\Nova\Fields\FieldCollection<int, \Laravel\Nova\Fields\Field>  $fields
     * @return \Laravel\Nova\Panel
     *
     * @phpstan-param \Laravel\Nova\Fields\FieldCollection<int, TFields>  $fields
     */
    public static function mutate($name, FieldCollection $fields)
    {
        $first = $fields->first();

        if ($first instanceof ResourceToolElement) {
            return static::make($name)
                ->withComponent($first->component)
                ->withMeta([
                    'fields' => $fields,
                    'prefixComponent' => false,
                    ...($first->panel?->meta() ?? []),
                ]);
        }

        /** @phpstan-ignore return.type */
        return tap($first->panel, static function ($panel) use ($name, $fields) {
            $panel->name = $name;
            $panel->withMeta(['fields' => $fields]);
        });
    }

    /**
     * Prepare the given fields.
     *
     * @param  (callable():(iterable))|iterable  $fields
     * @return array<int, TFields>
     *
     * @phpstan-param (callable():(TPanelFields))|TPanelFields $fields
     *
     * @phpstan-return TPanelFields
     */
    protected function prepareFields(callable|iterable $fields): iterable
    {
        $fields = is_callable($fields) ? call_user_func($fields) : $fields;

        return collect($this->filter($fields instanceof Collection ? $fields->all() : $fields))
            ->reject(static fn ($field) => $field instanceof MissingValue)
            ->values()
            ->each(function ($field) {
                $field->panel = $this;
            })->all();
    }

    /**
     * Get the default panel name for the given resource.
     *
     * @param  \Laravel\Nova\Resource  $resource
     * @return \Stringable|string
     */
    public static function defaultNameForDetail(Resource $resource)
    {
        return Nova::__(':resource Details: :title', [
            'resource' => $resource->singularLabel(),
            'title' => (string) $resource->title(),
        ]);
    }

    /**
     * Get the default panel name for a create panel.
     *
     * @param  \Laravel\Nova\Resource  $resource
     * @return \Stringable|string
     */
    public static function defaultNameForCreate(Resource $resource)
    {
        return Nova::__('Create :resource', [
            'resource' => (string) $resource->singularLabel(),
        ]);
    }

    /**
     * Get the default panel name for the update panel.
     *
     * @param  \Laravel\Nova\Resource  $resource
     * @return \Stringable|string
     */
    public static function defaultNameForUpdate(Resource $resource)
    {
        return Nova::__('Update :resource: :title', [
            'resource' => $resource->singularLabel(),
            'title' => $resource->title(),
        ]);
    }

    /**
     * Get the default panel name for the given resource.
     *
     * @param  \Laravel\Nova\Resource  $resource
     * @return \Stringable|string
     */
    public static function defaultNameForViaRelationship(Resource $resource, NovaRequest $request)
    {
        $field = $request->newViaResource()
            ->availableFields($request)
            ->filter(static function ($field) use ($request) {
                return $field instanceof RelatableField
                    && $field->resourceName === $request->resource
                    && $field->relationshipName() === $request->viaRelationship;
            })->first();

        return $field->name;
    }

    /**
     * Transform each field in the panel using a callback.
     *
     * @param  callable(\Laravel\Nova\Fields\Field, int):mixed  $callback
     * @return $this
     */
    public function each(callable $callback)
    {
        $this->data = Collection::make($this->data)
            ->transform(static function ($field, $key) use ($callback) {
                /**
                 * @var \Laravel\Nova\Fields\Field $field
                 * @var int $key
                 */
                call_user_func($callback, $field, $key);

                return $field;
            })->all();

        return $this;
    }

    /**
     * Display the toolbar when showing this panel.
     *
     * @return $this
     */
    public function withToolbar()
    {
        $this->showToolbar = true;

        return $this;
    }

    /**
     * Set the number of initially visible fields.
     *
     * @return $this
     */
    public function limit(int $limit)
    {
        $this->limit = $limit;

        return $this;
    }

    /**
     * Get the Vue component key for the panel.
     *
     * @return string
     */
    public function component()
    {
        return $this->component;
    }

    /**
     * Set the width for the help text tooltip.
     *
     * @param  string  $helpWidth
     * @return never
     *
     * @throws \Laravel\Nova\Exceptions\HelperNotSupported
     */
    public function helpWidth($helpWidth)
    {
        throw NovaException::helperNotSupported(__METHOD__, __CLASS__);
    }

    /**
     * Return the width of the help text tooltip.
     *
     * @return never
     *
     * @throws \Laravel\Nova\Exceptions\HelperNotSupported
     */
    public function getHelpWidth()
    {
        throw NovaException::helperNotSupported(__METHOD__, __CLASS__);
    }

    /**
     * Set the unique identifier for the panel.
     *
     * @return $this
     */
    public function withAttribute(string $attribute)
    {
        $this->attribute = $attribute;

        return $this;
    }

    /**
     * Prepare the panel for JSON serialization.
     *
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return array_merge([
            'collapsable' => $this->collapsable,
            'collapsedByDefault' => $this->collapsedByDefault,
            'component' => $this->component(),
            'name' => $this->name,
            'attribute' => $this->attribute,
            'showToolbar' => $this->showToolbar,
            'limit' => $this->limit,
            'helpText' => $this->getHelpText(),
        ], $this->meta());
    }

    /**
     * Convert the panel to string.
     */
    public function __toString(): string
    {
        return $this->name;
    }
}
