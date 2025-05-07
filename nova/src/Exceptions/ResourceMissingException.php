<?php

namespace Laravel\Nova\Exceptions;

use Exception;

class ResourceMissingException extends Exception
{
    /**
     * Construct a new exception.
     *
     * @param  \Illuminate\Database\Eloquent\Model  $model
     * @return void
     */
    public function __construct($model)
    {
        parent::__construct(
            __('Unable to find Resource for model [:model].', ['model' => get_class($model)])
        );
    }

    /**
     * Create a new exception instance.
     */
    public static function forRepeater(string $resource): static
    {
        return new static(
            __('Unable to find Resource for the given resource name [:resource]', ['resource' => $resource])
        );
    }
}
