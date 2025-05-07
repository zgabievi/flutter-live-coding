<?php

namespace Laravel\Nova\Actions;

use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Laravel\Nova\Fields\DateTime;
use Laravel\Nova\Fields\ID;
use Laravel\Nova\Fields\KeyValue;
use Laravel\Nova\Fields\MorphToActionTarget;
use Laravel\Nova\Fields\Status;
use Laravel\Nova\Fields\Text;
use Laravel\Nova\Fields\Textarea;
use Laravel\Nova\Http\Requests\NovaRequest;
use Laravel\Nova\Nova;
use Laravel\Nova\Resource;

/**
 * @template TActionModel of \Laravel\Nova\Actions\ActionEvent
 *
 * @extends \Laravel\Nova\Resource<TActionModel>
 */
class ActionResource extends Resource
{
    /**
     * The model the resource corresponds to.
     *
     * @var class-string<TActionModel>
     */
    public static $model = ActionEvent::class;

    /**
     * The policy the resource corrsponds to.
     *
     * @var class-string|null
     */
    public static $policy = ActionResourcePolicy::class;

    /**
     * The single value that should be used to represent the resource when being displayed.
     *
     * @var string
     */
    public static $title = 'name';

    /**
     * Indicates if the resource should be globally searchable.
     *
     * @var bool
     */
    public static $globallySearchable = false;

    /**
     * Indicates whether the resource should automatically poll for new resources.
     *
     * @var bool
     */
    public static $polling = true;

    /**
     * Get the fields displayed by the resource.
     *
     * @return array
     */
    #[\Override]
    public function fields(NovaRequest $request)
    {
        return [
            ID::make(Nova::__('ID'), 'id')->showOnPreview(),
            Text::make(Nova::__('Action Name'), 'name', static fn ($value) => Nova::__($value))->showOnPreview(),

            Text::make(Nova::__('Action Initiated By'), function () {
                return $this->user->name ?? $this->user->email ?? __('Nova User');
            })->showOnPreview(),

            MorphToActionTarget::make(Nova::__('Action Target'), 'target')->showOnPreview(),

            Status::make(Nova::__('Action Status'), 'status', static function ($value) {
                return transform($value, static fn ($value) => Nova::__(ucfirst($value)));
            })->loadingWhen([Nova::__('Waiting'), Nova::__('Running')])->failedWhen([Nova::__('Failed')]),

            $this->when(isset($this->original), static function () {
                return KeyValue::make(Nova::__('Original'), 'original')->showOnPreview();
            }),

            $this->when(isset($this->changes), static function () {
                return KeyValue::make(Nova::__('Changes'), 'changes')->showOnPreview();
            }),

            Textarea::make(Nova::__('Exception'), 'exception')->showOnPreview(),

            DateTime::make(Nova::__('Action Happened At'), 'created_at')->exceptOnForms()->showOnPreview(),
        ];
    }

    /**
     * Build an "index" query for the given resource.
     *
     * @return \Illuminate\Contracts\Database\Eloquent\Builder
     */
    #[\Override]
    public static function indexQuery(NovaRequest $request, Builder $query)
    {
        return $query->with('user');
    }

    /**
     * Determine if this resource is available for navigation.
     *
     * @return bool
     */
    #[\Override]
    public static function availableForNavigation(Request $request)
    {
        return false;
    }

    /**
     * Determine if this resource is searchable.
     *
     * @return bool
     */
    #[\Override]
    public static function searchable()
    {
        return false;
    }

    /**
     * Get the displayable label of the resource.
     *
     * @return \Stringable|string
     */
    #[\Override]
    public static function label()
    {
        return Nova::__('Action Events');
    }

    /**
     * Get the displayable singular label of the resource.
     *
     * @return \Stringable|string
     */
    #[\Override]
    public static function singularLabel()
    {
        return Nova::__('Action Event');
    }

    /**
     * Get the URI key for the resource.
     *
     * @return string
     */
    #[\Override]
    public static function uriKey()
    {
        return 'action-events';
    }
}
