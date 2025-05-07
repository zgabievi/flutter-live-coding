import { Filterable, InteractsWithQueryString, mapProps } from './index'
import { computed } from 'vue'
import debounce from 'lodash/debounce'
import find from 'lodash/find'
import includes from 'lodash/includes'
import upperFirst from 'lodash/upperFirst'

export default {
  mixins: [Filterable, InteractsWithQueryString],

  props: {
    ...mapProps([
      'resourceName',
      'viaResource',
      'viaResourceId',
      'viaRelationship',
      'relationshipType',
      'disablePagination',
    ]),

    field: { type: Object },
    perPageOptions: { type: Array, required: true },
  },

  provide() {
    return {
      resourceHasId: computed(() => this.resourceHasId),
      authorizedToViewAnyResources: computed(
        () => this.authorizedToViewAnyResources
      ),
      authorizedToUpdateAnyResources: computed(
        () => this.authorizedToUpdateAnyResources
      ),
      authorizedToDeleteAnyResources: computed(
        () => this.authorizedToDeleteAnyResources
      ),
      authorizedToRestoreAnyResources: computed(
        () => this.authorizedToRestoreAnyResources
      ),
      selectedResourcesCount: computed(() => this.selectedResources.length),
      selectAllChecked: computed(() => this.selectAllChecked),
      selectAllMatchingChecked: computed(() => this.selectAllMatchingChecked),
      selectAllOrSelectAllMatchingChecked: computed(
        () => this.selectAllOrSelectAllMatchingChecked
      ),
      selectAllAndSelectAllMatchingChecked: computed(
        () => this.selectAllAndSelectAllMatchingChecked
      ),
      selectAllIndeterminate: computed(() => this.selectAllIndeterminate),
      orderByParameter: computed(() => this.orderByParameter),
      orderByDirectionParameter: computed(() => this.orderByDirectionParameter),
    }
  },

  data: () => ({
    actions: [],
    allMatchingResourceCount: 0,
    authorizedToRelate: false,
    canceller: null,
    currentPageLoadMore: null,
    deleteModalOpen: false,
    initialLoading: true,
    loading: true,
    orderBy: '',
    orderByDirection: '',
    pivotActions: null,
    resourceHasId: true,
    resourceHasActions: false,
    resourceHasSoleActions: false,
    resourceResponse: null,
    resourceResponseError: null,
    resources: [],
    search: '',
    selectAllMatchingResources: false,
    selectedResources: [],
    softDeletes: false,
    trashed: '',
  }),

  async created() {
    if (Nova.missingResource(this.resourceName)) return Nova.visit('/404')

    const debouncer = debounce(
      callback => callback(),
      this.resourceInformation.debounce
    )

    this.initializeSearchFromQueryString()
    this.initializePerPageFromQueryString()
    this.initializeTrashedFromQueryString()
    this.initializeOrderingFromQueryString()

    await this.initializeFilters(this.lens || null)
    await this.getResources()

    if (!this.isLensView) {
      await this.getAuthorizationToRelate()
    }

    this.getActions()

    this.initialLoading = false

    this.$watch(
      () => {
        return (
          this.lens +
          this.resourceName +
          this.encodedFilters +
          this.currentSearch +
          this.currentPage +
          this.currentPerPage +
          this.currentOrderBy +
          this.currentOrderByDirection +
          this.currentTrashed
        )
      },
      () => {
        if (this.canceller !== null) this.canceller()

        if (this.currentPage === 1) {
          this.currentPageLoadMore = null
        }

        this.getResources()
      }
    )

    this.$watch('search', newValue => {
      this.search = newValue
      debouncer(() => this.performSearch())
    })
  },

  beforeUnmount() {
    if (this.canceller !== null) this.canceller()
  },

  methods: {
    /**
     * Handle resources loaded event.
     */
    handleResourcesLoaded() {
      this.loading = false

      if (!this.isLensView && this.resourceResponse.total !== null) {
        this.allMatchingResourceCount = this.resourceResponse.total
      } else {
        this.getAllMatchingResourceCount()
      }

      Nova.$emit(
        'resources-loaded',
        this.isLensView
          ? {
              resourceName: this.resourceName,
              lens: this.lens,
              mode: 'lens',
            }
          : {
              resourceName: this.resourceName,
              mode: this.isRelation ? 'related' : 'index',
            }
      )

      this.initializePolling()
    },

    /**
     * Select all of the available resources
     */
    selectAllResources() {
      this.selectedResources = this.resources.slice(0)
    },

    /**
     * Toggle the selection of all resources.
     *
     * @param {Event} e
     */
    toggleSelectAll(e) {
      if (e) {
        e.preventDefault()
      }

      if (this.selectAllChecked) {
        this.clearResourceSelections()
      } else {
        this.selectAllResources()
      }

      this.getActions()
    },

    /**
     * Toggle the selection of all matching resources in the database.
     *
     * @param {Event} e
     */
    toggleSelectAllMatching(e) {
      if (e) {
        e.preventDefault()
      }

      if (!this.selectAllMatchingResources) {
        this.selectAllResources()
        this.selectAllMatchingResources = true
      } else {
        this.selectAllMatchingResources = false
      }

      this.getActions()
    },

    /**
     * Deselect all selections
     *
     * @param {Event} e
     */
    deselectAllResources(e) {
      if (e) {
        e.preventDefault()
      }

      this.clearResourceSelections()

      this.getActions()
    },

    /*
     * Update the resource selection status
     *
     * @param {object} resource
     */
    updateSelectionStatus(resource) {
      if (!includes(this.selectedResources, resource)) {
        this.selectedResources.push(resource)
      } else {
        const index = this.selectedResources.indexOf(resource)
        if (index > -1) this.selectedResources.splice(index, 1)
      }

      this.selectAllMatchingResources = false

      this.getActions()
    },

    /**
     * Clear the selected resources and the "select all" states.
     */
    clearResourceSelections() {
      this.selectAllMatchingResources = false
      this.selectedResources = []
    },

    /**
     * Sort the resources by the given field.
     *
     * @param {string} field
     */
    orderByField(field) {
      let direction = this.currentOrderByDirection == 'asc' ? 'desc' : 'asc'

      if (this.currentOrderBy != field.sortableUriKey) {
        direction = 'asc'
      }

      this.pushAfterUpdatingQueryString({
        [this.orderByParameter]: field.sortableUriKey,
        [this.orderByDirectionParameter]: direction,
      })
    },

    /**
     * Reset the order by to its default state.
     *
     * @param {string} field
     */
    resetOrderBy(field) {
      this.pushAfterUpdatingQueryString({
        [this.orderByParameter]: field.sortableUriKey,
        [this.orderByDirectionParameter]: null,
      })
    },

    /**
     * Sync the current search value from the query string.
     */
    initializeSearchFromQueryString() {
      this.search = this.currentSearch
    },

    /**
     * Sync the current order by values from the query string.
     */
    initializeOrderingFromQueryString() {
      this.orderBy = this.currentOrderBy
      this.orderByDirection = this.currentOrderByDirection
    },

    /**
     * Sync the trashed state values from the query string.
     */
    initializeTrashedFromQueryString() {
      this.trashed = this.currentTrashed
    },

    /**
     * Update the trashed constraint for the resource listing.
     *
     * @param {string} trashedStatus
     */
    trashedChanged(trashedStatus) {
      this.trashed = trashedStatus
      this.pushAfterUpdatingQueryString({
        [this.trashedParameter]: this.trashed,
      })
    },

    /**
     * Update the per page parameter in the query string.
     *
     * @param {number} perPage
     */
    updatePerPageChanged(perPage) {
      this.perPage = perPage
      this.perPageChanged()
    },

    /**
     * Select the next page.
     *
     * @param {number} page
     */
    selectPage(page) {
      this.pushAfterUpdatingQueryString({ [this.pageParameter]: page })
    },

    /**
     * Sync the per page values from the query string.
     */
    initializePerPageFromQueryString() {
      this.perPage =
        this.queryStringParams[this.perPageParameter] ||
        this.initialPerPage ||
        null
    },

    /**
     * Close the delete modal.
     */
    closeDeleteModal() {
      this.deleteModalOpen = false
    },

    /**
     * Execute a search against the resource.
     */
    performSearch() {
      this.pushAfterUpdatingQueryString({
        [this.pageParameter]: 1,
        [this.searchParameter]: this.search,
      })
    },

    handleActionExecuted() {
      this.fetchPolicies()
      this.getResources()
    },
  },

  computed: {
    /**
     * Determibne the resource initial per page.
     *
     * @return {int|null}
     */
    initialPerPage() {
      if (this.perPageOptions && this.perPageOptions.length > 0) {
        return this.perPageOptions[0]
      }

      return null
    },

    /**
     * Determine if the resource has any filters.
     *
     * @returns {boolean}
     */
    hasFilters() {
      return this.$store.getters[`${this.resourceName}/hasFilters`]
    },

    /**
     * Get the name of the page query string variable.
     *
     * @returns {string}
     */
    pageParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_page`
        : `${this.resourceName}_page`
    },

    /**
     * Determine if all resources are selected on the page.
     *
     * @returns {boolean}
     */
    selectAllChecked() {
      return this.selectedResources.length == this.resources.length
    },

    /**
     * Determine if Select All Dropdown state is indeterminate.
     *
     * @returns {boolean}
     */
    selectAllIndeterminate() {
      return (
        Boolean(this.selectAllChecked || this.selectAllMatchingChecked) &&
        Boolean(!this.selectAllAndSelectAllMatchingChecked)
      )
    },

    /**
     * @returns {boolean}
     */
    selectAllAndSelectAllMatchingChecked() {
      return this.selectAllChecked && this.selectAllMatchingChecked
    },

    /**
     * @returns {boolean}
     */
    selectAllOrSelectAllMatchingChecked() {
      return this.selectAllChecked || this.selectAllMatchingChecked
    },

    /**
     * Determine if all matching resources are selected.
     *
     * @returns {boolean}
     */
    selectAllMatchingChecked() {
      return this.selectAllMatchingResources
    },

    /**
     * Get the IDs for the selected resources.
     *
     * @returns {int[]|string[]}
     */
    selectedResourceIds() {
      return this.selectedResources.map(resource => resource.id.value)
    },

    /**
     * Get the Pivot IDs for the selected resources.
     *
     * @returns {int[]|string[]|null[]}
     */
    selectedPivotIds() {
      return this.selectedResources.map(
        resource => resource.id.pivotValue ?? null
      )
    },

    /**
     * Get the current search value from the query string.
     *
     * @returns {string}
     */
    currentSearch() {
      return this.queryStringParams[this.searchParameter] || ''
    },

    /**
     * Get the current order by value from the query string.
     *
     * @returns {string}
     */
    currentOrderBy() {
      return this.queryStringParams[this.orderByParameter] || ''
    },

    /**
     * Get the current order by direction from the query string.
     *
     * @returns {string|null}
     */
    currentOrderByDirection() {
      return this.queryStringParams[this.orderByDirectionParameter] || null
    },

    /**
     * Get the current trashed constraint value from the query string.
     *
     * @returns {string}
     */
    currentTrashed() {
      return this.queryStringParams[this.trashedParameter] || ''
    },

    /**
     * Determine if the current resource listing is via a many-to-many relationship.
     *
     * @returns {boolean}
     */
    viaManyToMany() {
      return (
        this.relationshipType == 'belongsToMany' ||
        this.relationshipType == 'morphToMany'
      )
    },

    /**
     * Determine if the index is a relation field.
     *
     * @returns {boolean}
     */
    isRelation() {
      return Boolean(this.viaResourceId && this.viaRelationship)
    },

    /**
     * Get the singular name for the resource.
     *
     * @returns {string|null}
     */
    singularName() {
      if (this.isRelation && this.field) {
        return upperFirst(this.field.singularLabel)
      }

      if (this.resourceInformation) {
        return upperFirst(this.resourceInformation.singularLabel)
      }
    },

    /**
     * Determine if there are any resources for the view.
     *
     * @returns {boolean}
     */
    hasResources() {
      return Boolean(this.resources.length > 0)
    },

    /**
     * Determine if there any lenses for this resource.
     *
     * @returns {boolean}
     */
    hasLenses() {
      return Boolean(this.lenses.length > 0)
    },

    /**
     * Determine if the resource should show any cards.
     *
     * @returns {boolean}
     */
    shouldShowCards() {
      // Don't show cards if this resource is beings shown via a relations
      return Boolean(this.cards.length > 0 && !this.isRelation)
    },

    /**
     * Determine whether to show the select all election checkboxes for resources.
     *
     * @returns {boolean}
     */
    shouldShowSelectAllCheckboxes() {
      if (this.hasResources === false) {
        return false
      } else if (this.resourceHasId === false) {
        return false
      } else if (
        this.authorizedToDeleteAnyResources ||
        this.canShowDeleteMenu
      ) {
        return true
      } else if (this.resourceHasActions === true) {
        return true
      }
    },

    /**
     * Determine whether to show the selection checkboxes for resources.
     *
     * @returns {boolean}
     */
    shouldShowCheckboxes() {
      return (
        this.hasResources &&
        this.resourceHasId &&
        Boolean(
          this.resourceHasActions ||
            this.resourceHasSoleActions ||
            this.authorizedToDeleteAnyResources ||
            this.canShowDeleteMenu
        )
      )
    },

    /**
     * Determine whether the delete menu should be shown to the user.
     *
     * @returns {boolean}
     */
    shouldShowDeleteMenu() {
      return (
        Boolean(this.selectedResources.length > 0) && this.canShowDeleteMenu
      )
    },

    /**
     * Determine if any selected resources may be deleted.
     *
     * @returns {boolean}
     */
    authorizedToDeleteSelectedResources() {
      return Boolean(
        find(this.selectedResources, resource => resource.authorizedToDelete)
      )
    },

    /**
     * Determine if any selected resources may be force deleted.
     *
     * @returns {boolean}
     */
    authorizedToForceDeleteSelectedResources() {
      return Boolean(
        find(
          this.selectedResources,
          resource => resource.authorizedToForceDelete
        )
      )
    },

    /**
     * Determine if the user is authorized to view any listed resource.
     *
     * @returns {boolean}
     */
    authorizedToViewAnyResources() {
      return (
        this.resources.length > 0 &&
        this.resourceHasId &&
        Boolean(find(this.resources, resource => resource.authorizedToView))
      )
    },

    /**
     * Determine if the user is authorized to view any listed resource.
     *
     * @returns {boolean}
     */
    authorizedToUpdateAnyResources() {
      return (
        this.resources.length > 0 &&
        this.resourceHasId &&
        Boolean(find(this.resources, resource => resource.authorizedToUpdate))
      )
    },

    /**
     * Determine if the user is authorized to delete any listed resource.
     *
     * @returns {boolean}
     */
    authorizedToDeleteAnyResources() {
      return (
        this.resources.length > 0 &&
        this.resourceHasId &&
        Boolean(find(this.resources, resource => resource.authorizedToDelete))
      )
    },

    /**
     * Determine if the user is authorized to force delete any listed resource.
     *
     * @returns {boolean}
     */
    authorizedToForceDeleteAnyResources() {
      return (
        this.resources.length > 0 &&
        this.resourceHasId &&
        Boolean(
          find(this.resources, resource => resource.authorizedToForceDelete)
        )
      )
    },

    /**
     * Determine if any selected resources may be restored.
     *
     * @returns {boolean}
     */
    authorizedToRestoreSelectedResources() {
      return (
        this.resourceHasId &&
        Boolean(
          find(this.selectedResources, resource => resource.authorizedToRestore)
        )
      )
    },

    /**
     * Determine if the user is authorized to restore any listed resource.
     *
     * @returns {boolean}
     */
    authorizedToRestoreAnyResources() {
      return (
        this.resources.length > 0 &&
        this.resourceHasId &&
        Boolean(find(this.resources, resource => resource.authorizedToRestore))
      )
    },

    /**
     * Return the initial encoded filters from the query string.
     *
     * @param {string}
     */
    initialEncodedFilters() {
      return this.queryStringParams[this.filterParameter] || ''
    },

    /**
     * Return the pagination component for the resource.
     *
     * @param {string}
     */
    paginationComponent() {
      return `pagination-${Nova.config('pagination') || 'links'}`
    },

    /**
     * Determine if the resources has a next page.
     *
     * @param {boolean}
     */
    hasNextPage() {
      return Boolean(this.resourceResponse && this.resourceResponse.nextPageUrl)
    },

    /**
     * Determine if the resources has a previous page.
     *
     * @param {boolean}
     */
    hasPreviousPage() {
      return Boolean(this.resourceResponse && this.resourceResponse.prevPageUrl)
    },

    /**
     * Return the total pages for the resource.
     *
     * @param {number}
     */
    totalPages() {
      return Math.ceil(this.allMatchingResourceCount / this.currentPerPage)
    },

    /**
     * Return the resource count label.
     *
     * @param {string}
     */
    resourceCountLabel() {
      const first = this.perPage * (this.currentPage - 1)

      return (
        this.resources.length &&
        `${Nova.formatNumber(first + 1)}-${Nova.formatNumber(
          first + this.resources.length
        )} ${this.__('of')} ${Nova.formatNumber(this.allMatchingResourceCount)}`
      )
    },

    /**
     * Get the current per page value from the query string.
     *
     * @param {number}
     */
    currentPerPage() {
      return this.perPage
    },

    /**
     * Get the default label for the create button.
     *
     * @returns {string}
     */
    createButtonLabel() {
      if (this.resourceInformation)
        return this.resourceInformation.createButtonLabel

      return this.__('Create')
    },

    /**
     * Build the resource request query string.
     *
     * @returns {{[key: string]: any}}
     */
    resourceRequestQueryString() {
      const queryString = {
        search: this.currentSearch,
        filters: this.encodedFilters,
        orderBy: this.currentOrderBy,
        orderByDirection: this.currentOrderByDirection,
        perPage: this.currentPerPage,
        trashed: this.currentTrashed,
        page: this.currentPage,
        viaResource: this.viaResource,
        viaResourceId: this.viaResourceId,
        viaRelationship: this.viaRelationship,
        viaResourceRelationship: this.viaResourceRelationship,
        relationshipType: this.relationshipType,
      }

      if (!this.lensName) {
        queryString['viaRelationship'] = this.viaRelationship
      }

      return queryString
    },

    /**
     * Determine if the action selector should be shown.
     *
     * @param {boolean}
     */
    shouldShowActionSelector() {
      return this.selectedResources.length > 0 || this.haveStandaloneActions
    },

    /**
     * Determine if the view is a resource index or a lens.
     *
     * @param {boolean}
     */
    isLensView() {
      return this.lens !== '' && this.lens != undefined && this.lens != null
    },

    /**
     * Determine whether the pagination component should be shown.
     *
     * @param {boolean}
     */
    shouldShowPagination() {
      return (
        this.disablePagination !== true &&
        this.resourceResponse &&
        (this.hasResources || this.hasPreviousPage)
      )
    },

    /**
     * Return the current count of all resources
     *
     * @param {number}
     */
    currentResourceCount() {
      return this.resources.length
    },

    /**
     * Get the name of the search query string variable.
     *
     * @param {string}
     */
    searchParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_search`
        : `${this.resourceName}_search`
    },

    /**
     * Get the name of the order by query string variable.
     *
     * @param {string}
     */
    orderByParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_order`
        : `${this.resourceName}_order`
    },

    /**
     * Get the name of the order by direction query string variable.
     *
     * @param {string}
     */
    orderByDirectionParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_direction`
        : `${this.resourceName}_direction`
    },

    /**
     * Get the name of the trashed constraint query string variable.
     *
     * @param {string}
     */
    trashedParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_trashed`
        : `${this.resourceName}_trashed`
    },

    /**
     * Get the name of the per page query string variable.
     *
     * @param {string}
     */
    perPageParameter() {
      return this.viaRelationship
        ? `${this.viaRelationship}_per_page`
        : `${this.resourceName}_per_page`
    },

    /**
     * Determine whether there are any standalone actions.
     *
     * @returns {boolean}
     */
    haveStandaloneActions() {
      return this.allActions.filter(a => a.standalone === true).length > 0
    },

    /**
     * Return the available actions.
     *
     * @returns {object[]}
     */
    availableActions() {
      return this.actions
    },

    /**
     * Determine if the resource has any pivot actions available.
     *
     * @returns {boolean}
     */
    hasPivotActions() {
      return this.pivotActions && this.pivotActions.actions.length > 0
    },

    /**
     * Get the name of the pivot model for the resource.
     *
     * @returns {string}
     */
    pivotName() {
      return this.pivotActions ? this.pivotActions.name : ''
    },

    /**
     * Determine if the resource has any actions available.
     *
     * @returns {boolean}
     */
    actionsAreAvailable() {
      return this.allActions.length > 0
    },

    /**
     * Get all of the actions available to the resource.
     *
     * @returns {object[]}
     */
    allActions() {
      return this.hasPivotActions
        ? this.actions.concat(this.pivotActions.actions)
        : this.actions
    },

    /**
     * Get all of the standalon actions available to the resource.
     *
     * @returns {object[]}
     */
    availableStandaloneActions() {
      return this.allActions.filter(a => a.standalone === true)
    },

    /**
     * Get the selected resources for the action selector.
     *
     * @returns {string|string[]|int[]}
     */
    selectedResourcesForActionSelector() {
      return this.selectAllMatchingChecked ? 'all' : this.selectedResources
    },
  },
}
