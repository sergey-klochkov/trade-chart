(function (window, document, $) {
    "use strict";

    // Chart constants
    var DEFAULT_SCALE_INDEX = 4,
        DEFAULT_AREA_ENLARGE_FACTOR = 0.1,
        DEFAULT_Y_AXIS_WIDTH = 60,
        DEFAULT_X_AXIS_HEIGHT = 95,
        DEFAULT_Y_AXIS_STEP = 40,
        DEFAULT_X_AXIS_STEP = 80,
        DEFAULT_AXIS_TEXT_INDENT = 5,
        MAX_INT = 4294967295;

    var candleStickDrawConfig = {
        indexes:{
            left:0,
            lineOffset:1,
            width:2
        },
        config:[
            [0.5, 0.5, 1],
            [0.5, 1.5, 2],
            [1.5, 2.5, 2],
            [1.5, 3.5, 4],
            [1.5, 4.5, 6],
            [2.5, 6.5, 8],
            [2.5, 7.5, 10],
            [3.5, 9.5, 12],
            [3.5, 10.5, 14],
            [3.5, 11.5, 16],
            [4.5, 13.5, 18],
            [4.5, 14.5, 20],
            [5.5, 16.5, 22],
            [5.5, 17.5, 24]
        ],
        getMetrics:function (scale) {
            var metrics = this.config[scale],
                indexes = this.indexes;

            return {
                left:metrics[indexes.left],
                lineOffset:metrics[indexes.lineOffset],
                width:metrics[indexes.width]
            }
        }
    };

    var placeholderConfig = {
        indexes:{
            width:0,
            middle:1
        },
        sizes:[
            [2, 1],
            [4, 2],
            [6, 3],
            [8, 4],
            [10, 5],
            [14, 7],
            [16, 8],
            [20, 10],
            [22, 11],
            [24, 12],
            [28, 14],
            [30, 15],
            [34, 17],
            [36, 18]
        ],
        scaleNumber:14,
        getMetrics:function (scale) {
            var sizes = this.sizes[scale],
                indexes = this.indexes;

            return {
                width:sizes[indexes.width],
                middle:sizes[indexes.middle]
            }
        }
    };

    // Comparator for binary search for bar by pixel
    var comparator = function (elem, toFind) {
        if (elem.left > toFind) {
            return 1;
        }
        if (elem.right < toFind) {
            return -1;
        }

        return 0;
    };

    Array.prototype.binarySearch = function (find, comparator) {
        var low = 0,
            high = this.length - 1,
            i,
            comparison;
        while (low <= high) {
            i = Math.floor((low + high) / 2);
            comparison = comparator(this[i], find);
            if (comparison < 0) {
                low = i + 1;
            } else if (comparison > 0) {
                high = i - 1;
            } else {
                return i;
            }
        }

        return null;
    };

    var Utils = {
        /** Method for getting element offset */
        getElementOffset:function (elem) {

            function getOffsetSum(element) {

                var top = 0,
                    left = 0;

                while (element) {
                    top = top + parseInt(element.offsetTop);
                    left = left + parseInt(element.offsetLeft);
                    element = element.offsetParent;
                }

                return {
                    top:top,
                    left:left
                };
            }

            function getOffsetRect(element) {
                var box = element.getBoundingClientRect(),
                    body = document.body,
                    docElem = document.documentElement,
                    scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop,
                    scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft,
                    clientTop = docElem.clientTop || body.clientTop || 0,
                    clientLeft = docElem.clientLeft || body.clientLeft || 0,
                    top = box.top + scrollTop - clientTop,
                    left = box.left + scrollLeft - clientLeft;

                return {
                    top:Math.round(top),
                    left:Math.round(left)
                };
            }

            if (elem.getBoundingClientRect) {
                // Modern variant
                return getOffsetRect(elem);
            } else {
                // Fallback mechanism
                return getOffsetSum(elem);
            }
        },
        /** End of getElementOffset **/

        /** Method for getting cursor position in given element **/
        getCursorPositionInElement:function (e, element) {
            var cursorPositionInDocument = this.getCursorPositionInDocument(e),
                elementOffset = Utils.getElementOffset(element);

            return {
                x:cursorPositionInDocument.x - elementOffset.left,
                y:cursorPositionInDocument.y - elementOffset.top
            };
        },
        /** End of getCursorPositionInElement method **/

        /** Method for getting cursor position in document **/
        getCursorPositionInDocument:function (e) {
            var x,
                y;

            if (e.pageX && e.pageY) {
                x = e.pageX;
                y = e.pageY;
            } else {
                x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
                y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
            }

            return {
                x:x,
                y:y
            };
        },

        // Takes price and value of price unit in pixels (e.g. 1dollar = 18.9px)
        // Returns the y coordinate of price
        convertPriceValueToPixelValue:function (price, priceUnitInPixel) {
            return price * priceUnitInPixel;
        },

        // Method for getting "price value" of current cursor position
        // Takes "top" price of canvas, current cursor position(y-axis) and value of price unit in pixels
        getPriceOfCurrentCursorPosition:function (canvasTopPointValue, cursorYCoord, priceUnitInPixel) {
            return canvasTopPointValue - cursorYCoord / priceUnitInPixel;
        }
        /** End of getCursorPositionInDocument method **/

    };

    var HTMLUtils = {
        createElement: function(tag, $parent, insertionMethod, clazz, css) {
            if (!insertionMethod) {
                insertionMethod = 'append';
            }
            var $createdElement = $(tag, {'class':clazz}).css(css || {});
            $parent[insertionMethod]($createdElement);
            return $createdElement;
        }
    };

    var ColorSchemes = {
        light:'light',
        dark:'dark',
        custom:'custom'
    };

    var ColorSchemeController = function (colorScheme) {
        this.schemeType = colorScheme;
        this.light = {
            className:'light',
            bullishBars:'#55976E', // color of bullish candles (when open price of bar is lower than close price)
            bearishBars:'#CE3D2F', // color of bearish candles (when open price of bar is higher than close price)
            gridLines:'#EEE', // color of lines (horizontal lines) on the grid
            barBorder:'#333', // color of bar's borders
            cursorAim:'#888', // color cursor's aim lines
            bullishText:'#55976E',
            bearishText:'#CE3D2F',
            symbolText:'#333',
            axisText:'#333',
            axisStroke:'#EEE'
        };
        this.dark = {
            className:'dark',
            bullishBars:'#EEE', // color of bullish candles (when open price of bar is lower than close price)
            bearishBars:'#111', // color of bearish candles (when open price of bar is higher than close price)
            gridLines:'#555', // color of lines (horizontal lines) on the grid
            barBorder:'#33CC33', // color of bar's borders
            cursorAim:'#888', // color cursor's aim lines
            bearishText:'#EEE',
            bullishText:'#EEE',
            symbolText:'#EEE',
            axisText:'#EEE',
            axisStroke:'#EEE'
        };
    };

    ColorSchemeController.prototype = {
        setColorScheme:function (colorScheme) {
            if (colorScheme) {
                if (colorScheme === ColorSchemes.light) {
                    this.schemeValue = this.light;
                } else {
                    this.schemeValue = this.dark;
                }
            } else {
                throw 'No such scheme';
            }
        },

        colorScheme:function () {
            if (!this.schemeValue) {
                this.setColorScheme(this.schemeType);
            }

            return this.schemeValue;
        },

        setCustom:function (newScheme) {
            this.schemeValue = $.extend(true, {}, this.schemeValue, newScheme);
            this.schemeType = ColorSchemes.custom;
        }
    };

    var PlaceholderController = function (chart) {
        this.options = $.extend(true, {}, this.defaults, chart.options);
        this.chart = chart;
        this.eventBus = chart.eventBus;

        var opts = this.options,
            width = opts.canvasWidth,
            that = this;

        this.canvasWidth = width;
        this.gravityPoint = function () {
            var placeholderMetrics = placeholderConfig.getMetrics(DEFAULT_SCALE_INDEX),
                leftBoundary = width - placeholderMetrics.width,
                rightBoundary = width,
            // It is the middle point of bar from which we start drawing - rightmost bar
                middle = width - placeholderMetrics.middle,
            // Index of the bar (1 is the most recent => ((barIndex = 1) === prices[prices.length - 1]))
                barIndex = -1;

            return {
                leftBoundary:function (value) {
                    if (value) {
                        leftBoundary = Math.max(0, value);
                    } else {
                        return leftBoundary;
                    }
                    return this;
                },
                rightBoundary:function (value) {
                    if (value) {
                        rightBoundary = Math.min(width, value);
                    } else {
                        return rightBoundary;
                    }
                    return this;
                },
                middle:function (value) {
                    if (value) {
                        middle = value;
                    } else {
                        return middle;
                    }
                    return this;
                },
                barIndex:function (value) {
                    if (value) {
                        barIndex = Math.max(0, value);
                    } else {
                        return barIndex;
                    }
                    return this;
                },
                update:function (left, right, index, middlePosition) {
                    placeholderMetrics = placeholderConfig.getMetrics(that.chart.scaleIndex);
                    leftBoundary = Math.max(0, left);
                    rightBoundary = Math.min(width, right);
                    barIndex = index;
                    middle = Math.min(width - placeholderMetrics.middle, Math.max(placeholderMetrics.middle, middlePosition));
                    return this;
                }

            }
        }();
    };

    PlaceholderController.prototype = {
        getDrawRange:function () {
            var that = this;

            return {
                leftBar:that.leftMostBarIndex,
                rightBar:that.rightMostBarIndex
            }
        },

        move:function (diff, position) {
            var placeholderPositions = this.placeholderPositionsArray,
                barFocusedByCursor = placeholderPositions[placeholderPositions.binarySearch(position.x, comparator)],
                placeholderMiddle = placeholderConfig.getMetrics(this.chart.scaleIndex).middle,
                gravityPoint = this.gravityPoint,
                newCursorX;

            if (barFocusedByCursor) {
                newCursorX = Math.round(barFocusedByCursor.middle + diff);
                gravityPoint.update(newCursorX - placeholderMiddle, newCursorX + placeholderMiddle, barFocusedByCursor.index, newCursorX);
            } else {
                newCursorX = gravityPoint.middle() + diff;
                gravityPoint.update(newCursorX - placeholderMiddle, newCursorX + placeholderMiddle, gravityPoint.barIndex(), newCursorX);
            }

            this.chart.redraw();

            return false;
        },

        zoom:function (newScaleIndex, position) {
            var placeholderPositions = this.placeholderPositionsArray,
                gravityPoint = this.gravityPoint,
                placeholderMetrics = placeholderConfig.getMetrics(newScaleIndex),
                placeholderWidth = placeholderMetrics.width,
                placeholderMiddle = placeholderMetrics.middle,
                cursorX, placeholderLeft, barFocusedByCursor;

            if (position) {
                barFocusedByCursor = placeholderPositions[placeholderPositions.binarySearch(position.x, comparator)]
                if (barFocusedByCursor) {
                    cursorX = Math.round(barFocusedByCursor.middle);

                    placeholderLeft = cursorX - placeholderMiddle;

                    gravityPoint.update(placeholderLeft, placeholderLeft + placeholderWidth, barFocusedByCursor.index, cursorX);
                } else {
                    placeholderLeft = gravityPoint.middle() - placeholderMiddle;
                    gravityPoint.update(placeholderLeft, placeholderLeft + placeholderWidth, gravityPoint.barIndex(), gravityPoint.middle());
                }
            } else {
                placeholderLeft = this.canvasWidth - placeholderWidth;
                gravityPoint.update(placeholderLeft, placeholderLeft + placeholderWidth, gravityPoint.barIndex(), placeholderLeft + placeholderMiddle);
            }

            this.chart.redraw();
        },

        updatePosition:function () {
            // Method for getting index of rightmost bar
            function getRightMostBarIndex(spaceRemainsToTheRightOfGravity, gravityPointBarIndex, placeholderWidth) {
                return gravityPointBarIndex + Math.ceil(spaceRemainsToTheRightOfGravity / placeholderWidth);

            }

            // Method for getting index of leftmost bar
            function getLeftMostBarIndex(leftBoundary, gravityPointBarIndex, placeholderWidth) {
                return gravityPointBarIndex - Math.ceil(leftBoundary / placeholderWidth);
            }

            var width = this.canvasWidth,
                placeholderWidth = placeholderConfig.getMetrics(this.chart.scaleIndex).width,
                lastPriceIndex = this.chart.quotesController.getQuotesNumber() - 1,
                gravityPoint = this.gravityPoint,
                gravityPointIndex = gravityPoint.barIndex() !== -1 ? gravityPoint.barIndex() : gravityPoint.barIndex(lastPriceIndex).barIndex(),
                spaceRemainsToTheRightOfGravity = width - gravityPoint.rightBoundary(),
                rightMostBarIndex = Math.min(lastPriceIndex, getRightMostBarIndex(spaceRemainsToTheRightOfGravity, gravityPointIndex, placeholderWidth));

            this.leftMostBarIndex = Math.max(0, getLeftMostBarIndex(gravityPoint.leftBoundary(), gravityPointIndex, placeholderWidth));
            this.rightMostBarIndex = rightMostBarIndex;
        },

        placeholderPositionCalculator:function () {
            var scaleIndex = this.chart.scaleIndex,
                placeholderMetrics = placeholderConfig.getMetrics(scaleIndex),
                placeholderMiddle = placeholderMetrics.middle,
                placeholderWidth = placeholderMetrics.width,
                gravityPoint = this.gravityPoint,
                lastCalculatedPixel = gravityPoint.leftBoundary(),
                placeholderPositions = [];

            this.placeholderPositionsArray = placeholderPositions;

            return {
                processQuote:function (isLeft, index) {
                    var barAreaLeftBoundary = isLeft ? lastCalculatedPixel - placeholderWidth : lastCalculatedPixel,
                        barAreaRightBoundary = barAreaLeftBoundary + placeholderWidth,
                        lineOffset = barAreaLeftBoundary + placeholderMiddle - 0.5,

                        barCoordinates = {
                            left:barAreaLeftBoundary,
                            middle:lineOffset,
                            right:barAreaRightBoundary,
                            index:index
                        };

                    if (isLeft) {
                        placeholderPositions.unshift(barCoordinates);
                    } else {
                        placeholderPositions.push(barCoordinates);
                    }

                    lastCalculatedPixel += isLeft ? -placeholderWidth : placeholderWidth;

                    return barCoordinates;
                },

                startDrawToLeft:function () {
                    lastCalculatedPixel = gravityPoint.leftBoundary();
                },

                startDrawToRight:function () {
                    lastCalculatedPixel = gravityPoint.rightBoundary();
                }
            }
        }
    };

    var QuotesController = function (data, quoteIndexes, eventBus) {
        this.quoteIndexes = quoteIndexes;
        this.setData(data);
        this.eventBus = eventBus;
    };

    QuotesController.prototype = {
        setData:function (data) {
            var plainData;
            if (data instanceof Function) {
                console.log('function was passed');
                plainData = data();
            } else {
                plainData = data || [];
            }
            this.datamodel = [];

            for (var i = 0; i < plainData.length; i += 1) {
                this.addQuoteInternal(plainData[i]);
            }
        },

        addQuote:function (quote) {
            if (!this.datamodel) {
                return;
            }

            var quoteIndexes = this.quoteIndexes,
                eventBus = this.eventBus,
                newQuote = [];
            newQuote[quoteIndexes.open] = quote.val;
            newQuote[quoteIndexes.close] = quote.val;
            newQuote[quoteIndexes.low] = quote.val;
            newQuote[quoteIndexes.high] = quote.val;
            newQuote[quoteIndexes.timestamp] = quote.timestamp;

            this.addQuoteInternal(newQuote);

            eventBus.fire('onQuote', true);
        },

        addQuoteInternal:function (quote) {
            var quoteIndexes = this.quoteIndexes;
            quote[quoteIndexes.timestamp] = new Date(quote[quoteIndexes.timestamp]);

            this.datamodel.push(quote);
        },

        updateQuote:function (quote, index) {
            if (!this.datamodel || this.datamodel.length < 1) {
                return;
            }

            var quoteToUpdate,
                quoteIndexes = this.quoteIndexes,
                eventBus = this.eventBus;
            if (!index) {
                quoteToUpdate = this.getLastQuote();
            } else {
                var quoteNumber = this.getQuotesNumber();
                if (index < 0 || index >= quoteNumber) {
                    throw "Index of quote is wrong. Should be between 0 and " + quoteNumber;
                }
                quoteToUpdate = this.datamodel[index];
            }

            if (quote.val > quoteToUpdate[quoteIndexes.high]) {
                quoteToUpdate[quoteIndexes.high] = quote.val;
            }

            if (quote.val < quoteToUpdate[quoteIndexes.low]) {
                quoteToUpdate[quoteIndexes.low] = quote.val;
            }

            quoteToUpdate[quoteIndexes.close] = quote.val;

            eventBus.fire('onQuote', false);
        },

        getQuotes:function () {
            return this.datamodel;
        },

        noQuotes:function () {
            return !this.datamodel || this.datamodel.length <= 0;
        },

        getLastQuote:function () {
            return this.datamodel[this.getQuotesNumber() - 1];
        },

        getQuotesNumber:function () {
            return this.datamodel.length;
        }
    };

    var EventBus = function (events) {
        this.events = {};

        for (var i = 0; i < events.length; i += 1) {
            this.registerEvent(events[i]);
        }
    };

    EventBus.prototype = function () {
        function removeValueFromArray(array, value) {
            for (var i = 0; i < array.length; i++) {
                if (array[i] === value) {
                    array.splice(i, 1);
                    return;
                }
            }
        }

        return {
            registerEvent:function (event) {
                if (!this.events[event]) {
                    this.events[event] = [];
                }

                return this;
            },

            removeEvent:function (event) {
                this.events[event] = null;

                return this;
            },

            addListener:function (event, listener) {
                var listeners = this.events[event];
                if (!listeners) {
                    throw 'Event is not registred in event bus: ' + event;
                }
                listeners.unshift(listener);

                return this;
            },

            removeListener:function (event, listener) {
                var listeners = this.events[event];
                if (!listeners) {
                    throw 'Event is not registred in event bus: ' + event;
                }
                removeValueFromArray(listeners, listener);

                return this;
            },

            removeListenerFromAllEvents:function (listener) {
                for (var event in this.events) {
                    removeValueFromArray(this.events[event], listener)
                }

                return this;
            },

            fire:function (event, args) {
                var listeners = this.events[event];
                if (!listeners) {
                    throw 'Event is not registred in event bus: ' + event;
                }
                for (var i = 0; i < listeners.length; i += 1) {
                    listeners[i][event](args);
                }

                return this;
            }
        }
    }();

    var StockChart = function (elem, options, dataModel) {
        this.options = $.extend(true, {}, this.defaults, options);
        this.scaleIndex = DEFAULT_SCALE_INDEX;
        this.eventBus = new EventBus(['mouseMoved', 'redraw', 'zoom', 'onQuote']);
        this.quotesController = new QuotesController(dataModel, this.options.quoteIndexes, this.eventBus);
        this.placeholderController = new PlaceholderController(this);

        if (!this.options.symbolName) {
            alert("Symbol is not specified!");
            return;
        }

        var colorScheme = this.options.colorScheme,
            colorSchemeController = new ColorSchemeController(colorScheme);

        this.colorSchemeController = colorSchemeController;

        var $elem = $(elem),
            $chartTable = $('<table/>', {'class':'table-chart'}),
            $mainRow = HTMLUtils.createElement('<tr/>', $chartTable, 'append', 'row-main'),
            $dateRow = HTMLUtils.createElement('<tr/>', $chartTable, 'append', 'row-date'),
            datePane = new ChartDatePane(this, $dateRow),
            candleStickChartPane = new MainPane(this, $mainRow);

        this.mainPane = candleStickChartPane;
        this.datePane = datePane;
        this.$chartTable = $chartTable;

        $elem.append($chartTable);
        $chartTable.addClass(colorSchemeController.colorScheme().className);

        // draw initial chart
        this.redraw();

        this.eventBus.addListener('onQuote', this);
    };

    StockChart.prototype = {
        defaults:{
            canvasWidth:800,
            canvasHeight:550,
            textSettings:{
                fontSize:16,
                font:'16px Calibri',
                dateFont:'12px Calibri'
            },
            quoteIndexes:{ // default indexes for quotes
                open:0,
                high:1,
                low:2,
                close:3,
                timestamp:4
            },
            listenForEvents:true,
            colorScheme:ColorSchemes.light,
            axisSettings:{
                decimalsOnAxis:4,
                axisFontSize:14,
                axisFont:'14px Calibri'
            }
        },

        setData:function (data) {
            this.quotesController.setData(data);
            this.redraw();
        },

        redraw:function () {
            if (!this.quotesController.noQuotes()) {
                this.eventBus.fire('redraw');
            }
        },

        zoomIn:function () {
            this.zoom(1);
        },

        zoomOut:function () {
            this.zoom(-1);
        },

        zoom:function (diff) {
            this.zoomTo(this.scaleIndex + diff);
        },

        zoomTo:function (zoom) {
            var scaleIndex = this.scaleIndex,
                scalesNumber = placeholderConfig.scaleNumber,
                needRedraw;

            if (scaleIndex > 0 && zoom <= 0) {
                this.scaleIndex = 0;
                needRedraw = true;
            } else if (scaleIndex < scalesNumber - 1 && zoom >= scalesNumber) {
                this.scaleIndex = scalesNumber - 1;
                needRedraw = true;
            } else if (zoom > 0 && zoom < scalesNumber) {
                this.scaleIndex = zoom;
                needRedraw = true;
            }

            if (needRedraw) {
                this.eventBus.fire('zoom', this.scaleIndex);
            }
        },

        addQuote:function (quote) {
            this.quotesController.addQuote(quote);
        },

        updateQuote:function (quote) {
            this.quotesController.updateQuote(quote);
        },

        onQuote:function (isNew) {
            if (isNew) {
                if (this.placeholderController.getDrawRange().rightBar + 2 === this.quotesController.getQuotesNumber()) {
                    this.placeholderController.move(-placeholderConfig.getMetrics(this.scaleIndex).width, {'x': -1, 'y': -1});
                }
            } else {
                this.redraw();
            }
        },

        changeScheme:function (colorScheme) {
            var schemeController = this.colorSchemeController;
            this.$chartTable.removeClass(schemeController.colorScheme().className);
            schemeController.setColorScheme(colorScheme);
            this.$chartTable.addClass(schemeController.colorScheme().className);
            this.redraw();
            this.eventBus.fire('mouseMoved');
        }
    };

    var ChartAuxPaneView = function (data) {
        this.data = data;
        this.panes = [];
        data.eventBus.addListener('mouseMoved', this);

        this.createPanes();
    };

    ChartAuxPaneView.prototype = {
        createPanes:function () {
            var context = this.data.context,
                vertPatternImage = new Image(),
                horzPatternImage = new Image(),
                that = this;

            vertPatternImage.onload = function () {
                that.data.vertPattern = context.createPattern(vertPatternImage, 'repeat');
            };
            vertPatternImage.src = 'img/dash-pattern-vert.png';

            horzPatternImage.onload = function () {
                that.data.horzPattern = context.createPattern(horzPatternImage, 'repeat');
            };
            horzPatternImage.src = 'img/dash-pattern-horz.png';

            this.panes.push(new ChartPaneAuxCursorCrossRenderer({
                parentData:this.data,
                lineWidth:1
            }), new ChartPaneAuxPriceRenderer({
                textSettings:this.data.options.textSettings,
                context:this.data.context,
                canvasWidth:this.data.width
            }));
        },

        mouseMoved:function (drawData) {
            this.data.context.clearRect(0, 0, this.data.width, this.data.height);
            if (drawData) {
                this.drawData = drawData;
            }
            var panes = this.panes,
                price = this.drawData.price,
                colorSettings = this.data.colorController.colorScheme(),
                i, color;
            if (price) {
                if (price.open > price.close) {
                    this.drawData.fillStyle = colorSettings.bearishText;
                } else {
                    this.drawData.fillStyle = colorSettings.bullishText;
                }
            }
            for (i = 0; i < panes.length; i += 1) {
                panes[i].draw(this.drawData);
            }
        }
    };

    var ChartPaneAuxCursorCrossRenderer = function (data) {
        this.data = data;
    };

    ChartPaneAuxCursorCrossRenderer.prototype = {
        draw:function (drawData) {
            if (!(this.data.parentData.vertPattern && this.data.parentData.horzPattern)) {
                return;
            }

            var vertPattern = this.data.parentData.vertPattern,
                horzPattern = this.data.parentData.horzPattern,
                canvasWidth = this.data.parentData.width,
                canvasHeight = this.data.parentData.height,
                context = this.data.parentData.context,
                position = drawData.position;

            context.save();
            context.lineWidth = this.data.lineWidth;
            context.strokeStyle = vertPattern;

            context.beginPath();

            context.moveTo(position.x, 0);
            context.lineTo(position.x, canvasHeight);

            context.closePath();
            context.stroke();

            context.strokeStyle = horzPattern;
            context.beginPath();

            context.moveTo(0, position.y);
            context.lineTo(canvasWidth, position.y);

            context.closePath();
            context.stroke();

            context.restore();
        }
    };

    var ChartPaneAuxPriceRenderer = function (data) {
        this.data = data;
    };

    ChartPaneAuxPriceRenderer.prototype = {
        draw:function (drawData) {
            if (!drawData.price) {
                return;
            }

            var context = this.data.context,
                price = drawData.price,
                priceText = 'O: ' + price.open.toFixed(4) + '  H: ' + price.high.toFixed(4) + '  L: ' + price.low.toFixed(4) + '  C: ' + price.close.toFixed(4),
                textSettings = this.data.textSettings,
                textOffsetTop = textSettings.fontSize + 5;

            context.font = textSettings.font;
            context.fillStyle = drawData.fillStyle;
            context.fillText(priceText, this.data.canvasWidth - context.measureText(priceText).width - 10, textOffsetTop);
        }
    };

    var CandleStickRenderer = function () {

    };

    CandleStickRenderer.prototype = {
        drawDataCalculator:function (scaleIndex, quoteIndexes) {
            var candleMetrics = candleStickDrawConfig.getMetrics(scaleIndex),
                candleLeft = candleMetrics.left,
                candleLineOffset = candleMetrics.lineOffset,
                drawData = { up:[],
                    down:[] },
                up = drawData.up,
                down = drawData.down;

            this.drawData = drawData;

            return {
                processQuote:function (isLeft, placeholder, priceToDraw, canvasTopPointValue, priceUnitInPixel) {
                    var leftPixel = placeholder.left + candleLeft,
                        lineOffset = placeholder.left + candleLineOffset,
                        top = Utils.convertPriceValueToPixelValue(canvasTopPointValue - priceToDraw[quoteIndexes.high], priceUnitInPixel),
                        bottom = Utils.convertPriceValueToPixelValue(canvasTopPointValue - priceToDraw[quoteIndexes.low], priceUnitInPixel),
                        openPrice = priceToDraw[quoteIndexes.open],
                        closePrice = priceToDraw[quoteIndexes.close],
                        candle = {
                            left:leftPixel,
                            middle:lineOffset,
                            top:top,
                            bottom:bottom
                        };


                    if (openPrice > closePrice) {
                        candle.barTopmostPixel = Utils.convertPriceValueToPixelValue(canvasTopPointValue - openPrice, priceUnitInPixel);
                        candle.height = Utils.convertPriceValueToPixelValue(openPrice - closePrice, priceUnitInPixel);
                        if (isLeft) {
                            down.unshift(candle);
                        } else {
                            down.push(candle);
                        }
                    } else {
                        candle.barTopmostPixel = Utils.convertPriceValueToPixelValue(canvasTopPointValue - closePrice, priceUnitInPixel);
                        candle.height = Utils.convertPriceValueToPixelValue(closePrice - openPrice, priceUnitInPixel);
                        if (isLeft) {
                            up.unshift(candle);
                        } else {
                            up.push(candle);
                        }
                    }

                    return candle;
                }
            }
        },

        render:function (context, scaleIndex, textSettings, colorSettings, symbolName) {
            var barsToDraw = this.drawData,
                candleMetrics = candleStickDrawConfig.getMetrics(scaleIndex),
                barWidth = candleMetrics.width,
                textOffsetLeft = 5,
                textOffsetTop = textSettings.fontSize + 5,
                i,
                bar;

            function drawBar(barTopmostPixel, height, barLeftmostPixel, top, bottom, barMiddlePixel) {
                context.fillRect(barLeftmostPixel, barTopmostPixel, barWidth, height);
                context.strokeRect(barLeftmostPixel, barTopmostPixel, barWidth, height);

                context.moveTo(barMiddlePixel, top);
                context.lineTo(barMiddlePixel, barTopmostPixel);
                context.moveTo(barMiddlePixel, barTopmostPixel + height);
                context.lineTo(barMiddlePixel, bottom);

            }

            context.strokeStyle = colorSettings.barBorder;
            context.lineWidth = 1;
            context.beginPath();

            context.fillStyle = colorSettings.bullishBars;
            for (i = 0; i < barsToDraw.up.length; i += 1) {
                bar = barsToDraw.up[i];
                drawBar(bar.barTopmostPixel, bar.height, bar.left, bar.top, bar.bottom, bar.middle);
            }

            context.fillStyle = colorSettings.bearishBars;
            for (i = 0; i < barsToDraw.down.length; i += 1) {
                bar = barsToDraw.down[i];
                drawBar(bar.barTopmostPixel, bar.height, bar.left, bar.top, bar.bottom, bar.middle);
            }

            context.closePath();
            context.stroke();

            context.font = textSettings.font;
            context.fillStyle = colorSettings.symbolText;
            context.fillText(symbolName, textOffsetLeft, textOffsetTop);

        }
    };

    var ChartDatePane = function (chart, $container) {
        this.chart = chart;
        chart.eventBus.addListener('mouseMoved', this).addListener('redraw', this);

        var $chartDateTd = HTMLUtils.createElement('<td/>', $container),
            $chartDateWrapper = HTMLUtils.createElement('<div/>', $chartDateTd, 'append', 'canvas-wrapper', {'height': DEFAULT_X_AXIS_HEIGHT}),
            $xAxisCanvas = $('<canvas/>', {'class':'canvas axis-canvas x'}).attr({'width':chart.options.canvasWidth, 'height':DEFAULT_X_AXIS_HEIGHT}),
            $xValueBadge = $('<div/>', {'class':'value-badge hidden'}).css({
                'top':3,
                'width':120
            });

        $chartDateWrapper.append($xAxisCanvas, $xValueBadge);

        // Empty TD for consistency
        HTMLUtils.createElement('<td/>', $container)

        this.canvas = $xAxisCanvas[0];
        this.context = this.canvas.getContext('2d');
        this.$xValueBadge = $xValueBadge;
    };

    ChartDatePane.prototype = function () {
        function formatDate(date) {
            function formatPart(part) {
                if (part <= 9) {
                    return '0' + part;
                }

                return part;
            }

            var day = formatPart(date.getDate()),
                month = formatPart(date.getMonth() + 1),
                year = date.getFullYear(),
                hours = formatPart(date.getHours()),
                minutes = formatPart(date.getMinutes());

            return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes;
        }

        return {
            redraw:function () {
                var prices = this.chart.quotesController.getQuotes(),
                    placeholderWidth = placeholderConfig.getMetrics(this.chart.scaleIndex).width,
                    step = Math.floor(DEFAULT_X_AXIS_STEP / placeholderWidth),
                    placeholderPositions = this.chart.placeholderController.placeholderPositionsArray,
                    textSettings = this.chart.options.textSettings,
                    colorSettings = this.chart.colorSchemeController.colorScheme(),
                    quoteIndexes = this.chart.options.quoteIndexes,
                    canvas = this.canvas,
                    context = this.context,
                    i, bar, date, dateTxt, drawPositionX;

                function inRad(num) {
                    return num * Math.PI / 180;
                }

                function findPivotBar(placeholders) {
                    bar = placeholders[0];
                    return step - (bar.index % step);
                }

                context.clearRect(0, 0, canvas.width, canvas.height);

                context.font = textSettings.dateFont;
                context.fillStyle = colorSettings.axisText;
                drawPositionX = context.measureText(formatDate(new Date())).width + 5;
                context.strokeStyle = colorSettings.axisStroke;
                context.beginPath();
                for (i = findPivotBar(placeholderPositions); i < placeholderPositions.length; i += step) {
                    bar = placeholderPositions[i];
                    context.moveTo(bar.middle, 0);
                    context.lineTo(bar.middle, 3);
                    context.save();
                    date = prices[bar.index][quoteIndexes.timestamp];
                    dateTxt = formatDate(date);
                    context.translate(bar.middle + 4, drawPositionX);
                    context.rotate(inRad(-90));
                    context.fillText(dateTxt, 0, 0);
                    context.restore();
                }
                context.closePath();
                context.stroke();
            },

            mouseMoved:function (drawData) {
                if (drawData) {
                    this.drawData = drawData;
                }
                var $xValueBadge = this.$xValueBadge,
                    canvasWidth = this.chart.options.canvasWidth,
                    valuebadgeText;
                if (!this.drawData.price) {
                    valuebadgeText = '';
                } else {
                    valuebadgeText = formatDate(this.drawData.price.timestamp);
                }

                $xValueBadge.text(valuebadgeText).removeClass('hidden').css({
                    'left':Math.min(canvasWidth - $xValueBadge.outerWidth(true), Math.max(0, this.drawData.position.x - $xValueBadge.outerWidth() / 2))
                });
            }
        }
    }();

    var MainPane = function (chart, $container) {
        this.options = chart.options;
        this.chart = chart;
        chart.eventBus.addListener('redraw', this).addListener('zoom', this);

        var opts = this.options,
            width = opts.canvasWidth,
            height = opts.canvasHeight,
            eventBus = chart.eventBus,
            $chartPaneContentTd = HTMLUtils.createElement('<td/>', $container),
            $chartPaneContentWrapper = HTMLUtils.createElement('<div/>', $chartPaneContentTd, 'append', 'canvas-wrapper', {'height': height + 6}),
            $chartPaneYAxisTd = HTMLUtils.createElement('<td/>', $container),
            $chartPaneYAxisWrapper = HTMLUtils.createElement('<div/>', $chartPaneYAxisTd, 'append', 'canvas-wrapper', {'height': height + 6}),
            $canvas = $('<canvas/>', {'class':'canvas main-canvas'}).attr({'width':width, 'height':height}),
            $auxCanvas = $('<canvas/>', {'class':'canvas aux-canvas'}).attr({'width':width, 'height':height}),
            $yAxisCanvas = $('<canvas/>', {'class':'canvas axis-canvas y'}).attr({'width':DEFAULT_Y_AXIS_WIDTH, 'height':height}),
            $yValueBadge = $('<div/>', {'class':'value-badge hidden'});

        $chartPaneContentWrapper.append($canvas, $auxCanvas);

        $chartPaneYAxisWrapper.append($yAxisCanvas, $yValueBadge);

        $canvas.attr({'height':height + 6});
        $auxCanvas.attr({'height':height + 6});

        this.canvas = $canvas[0];
        this.auxCanvas = $auxCanvas[0];
        this.yAxisCanvas = $yAxisCanvas[0];
        this.canvasContext = this.canvas.getContext('2d');
        this.auxCanvasContext = this.auxCanvas.getContext('2d');
        this.yCanvasContext = this.yAxisCanvas.getContext('2d');
        this.eventBus = eventBus;
        this.$yValueBadge = $yValueBadge;
        this.placeholderController = chart.placeholderController;
        this.renderer = new CandleStickRenderer();

        this.cursorPaneView = new ChartAuxPaneView({
            width:$auxCanvas.attr('width'),
            height:$auxCanvas.attr('height'),
            context:this.auxCanvasContext,
            options:opts,
            eventBus:this.eventBus,
            colorController:chart.colorSchemeController
        });

        // bind events to canvases
        if (opts.listenForEvents) {
            this.bindEvents();
        }
    };

    MainPane.prototype = {
        bindEvents:function () {
            var that = this,
                $auxCanvas = $(this.auxCanvas),
                canvas = this.canvas,
                oldPosition,
                newPosition,
                isInDrag = false,
                mousedown = 0;

            function move() {
                if (!oldPosition || !newPosition) {
                    return;
                }
                var delta = newPosition.x - oldPosition.x;

                that.move(delta);
                oldPosition.x += delta;
            }

            $auxCanvas.on({
                'mousemove':function (e) {
                    var position = Utils.getCursorPositionInElement(e, canvas);

                    that.currentCursorPosition = position;
                    that.moveCursor();

                    if (isInDrag) {
                        if (!$auxCanvas.hasClass('grabbed')) {
                            $auxCanvas.addClass('grabbed');
                        }
                        newPosition = position;
                        move();
                    }
                },

                'mouseleave':function () {
                    // hide aux and badges?
//                var $yValueBadge = that.$yValueBadge;
//                if (!$yValueBadge.hasClass('hidden')) {
//                    $yValueBadge.addClass('hidden');
//                }
                    if (mousedown) {
                        $auxCanvas.trigger('mouseup');
                    }
                },

                'mousedown':function (e) {
                    mousedown = 1;
                    oldPosition = Utils.getCursorPositionInElement(e, canvas);
                    newPosition = oldPosition;
                    isInDrag = true;
                },

                'mouseup':function () {
                    mousedown = 0;
                    isInDrag = false;
                    $auxCanvas.removeClass('grabbed');
                    move();
                },

                'mousewheel wheel':function (e) {
                    e = e.originalEvent || window.event;

                    var delta = e.deltaY || e.wheelDelta,
                        dir;

                    dir = delta && (delta < 0 ? 1 : -1);
                    if (e.wheelDelta) {
                        // dir *= -1;
                    }

                    that.chart.zoom(dir);
                    return false;
                }
            });
        },

        redraw:function () {
            var that = this;

            function redrawWithProfiling() {
                function executeWithProfiling(obj, method) {
                    var time = new Date().getTime();
                    method.apply(obj);
                    return (new Date().getTime() - time);
                }

                var totalCalcTime = 0,
                    totalYAxisTime = 0,
                    totalDrawingTime = 0;

                for (var i = 0; i < 100; i++) {
                    that.canvasContext.clearRect(0, 0, that.canvas.width, that.canvas.height);
                    that.yCanvasContext.clearRect(0, 0, that.yAxisCanvas.width, that.yAxisCanvas.height);
                    totalCalcTime += executeWithProfiling(that.placeholderController, that.placeholderController.updatePosition);
                    totalCalcTime += executeWithProfiling(that, that.calculateDrawData);
                    totalYAxisTime += executeWithProfiling(that, that.drawYGridAndAxis);
                    totalDrawingTime += executeWithProfiling(that, that.draw);
                }

                console.log('Performing calculation took ' + totalCalcTime + ' millis');
                console.log('Drawing Y-axis took ' + totalYAxisTime + ' millis');
                console.log('Drawing of chart itself took ' + totalDrawingTime + ' millis');
            }

            if (this.options.profilingMode) {
                redrawWithProfiling();
                return;
            }

            this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.yCanvasContext.clearRect(0, 0, this.yAxisCanvas.width, this.yAxisCanvas.height);
            this.placeholderController.updatePosition();
            this.calculateDrawData();
            this.drawYGridAndAxis();
            this.draw();
        },

        calculateDrawData:function () {
            var prices = this.chart.quotesController.getQuotes(),
                quoteIndexes = this.chart.options.quoteIndexes,
                gravityPointIndex = this.placeholderController.gravityPoint.barIndex(),
                maxPrice = 0,
                minPrice = MAX_INT,
                i, high, low,
                drawRange = this.placeholderController.getDrawRange(),
                leftMostBarIndex = drawRange.leftBar,
                rightMostBarIndex = drawRange.rightBar,
                placeholderCalculator = this.placeholderController.placeholderPositionCalculator(),
                drawDataCalculator = this.renderer.drawDataCalculator(this.chart.scaleIndex, quoteIndexes);

            // finding the highest and the lowest prices in bars, that will be draws
            for (i = leftMostBarIndex; i <= rightMostBarIndex; i += 1) {
                high = prices[i][quoteIndexes.high];
                low = prices[i][quoteIndexes.low];

                if (high > maxPrice) {
                    maxPrice = high;
                }
                if (low < minPrice) {
                    minPrice = low;
                }
            }

            // Calculating value(in $) of canvas top and bottom points
            var canvasTopPointValue = maxPrice + (maxPrice - minPrice) * DEFAULT_AREA_ENLARGE_FACTOR,
                canvasBottomPointValue = minPrice + maxPrice - canvasTopPointValue,
                priceUnitInPixel = this.canvas.height / (canvasTopPointValue - canvasBottomPointValue);


            // Add gravityPoint bar
            processQuote(false, gravityPointIndex);

            // Function for creating drawData for the bar
            function processQuote(isLeft, barIndex) {
                var barCoordinates = placeholderCalculator.processQuote(isLeft, barIndex),
                    priceToDraw = prices[barIndex],
                    drawData = drawDataCalculator.processQuote(isLeft, barCoordinates, priceToDraw, canvasTopPointValue, priceUnitInPixel);

                return drawData;
            }

            placeholderCalculator.startDrawToLeft();
            for (i = gravityPointIndex - 1; i >= leftMostBarIndex; i -= 1) {
                processQuote(true, i);
            }

            placeholderCalculator.startDrawToRight();
            for (i = gravityPointIndex + 1; i <= rightMostBarIndex; i += 1) {
                processQuote(false, i);
            }

            this.canvasTopPointValue = canvasTopPointValue;
            this.canvasBottomPointValue = canvasBottomPointValue;
            this.priceUnitInPixel = priceUnitInPixel;
        },

        move:function (diff) {
            this.chart.placeholderController.move(diff, this.currentCursorPosition);
        },

        zoom:function (newScaleIndex) {
            this.chart.placeholderController.zoom(newScaleIndex, this.currentCursorPosition);
        },

        drawYGridAndAxis:function () {
            var context = this.canvasContext,
                yContext = this.yCanvasContext,
                priceUnitInPixel = this.priceUnitInPixel,
                width = this.canvas.width,
                canvasTopPointValue = this.canvasTopPointValue,
                canvasBottomPointValue = this.canvasBottomPointValue,
                yGridStep = DEFAULT_Y_AXIS_STEP / priceUnitInPixel, //(canvasTopPointValue - canvasBottomPointValue) / 12,
                yGridValue,
                colorSettings = this.chart.colorSchemeController.colorScheme();

            context.strokeStyle = colorSettings.gridLines;
            yContext.strokeStyle = colorSettings.axisStroke;
            yContext.fillStyle = colorSettings.axisText;
            yContext.font = this.options.axisSettings.axisFont;

            context.beginPath();
            yContext.beginPath();

            for (yGridValue = canvasTopPointValue - yGridStep; (yGridValue - canvasBottomPointValue) > 0.001; yGridValue -= yGridStep) {
                var yCoord = Math.floor(Utils.convertPriceValueToPixelValue(canvasTopPointValue - yGridValue, priceUnitInPixel)) + 0.5,
                    price = yGridValue.toFixed(this.options.axisSettings.decimalsOnAxis);

                yContext.moveTo(0, yCoord);
                yContext.lineTo(3, yCoord);

                yContext.fillText(price, DEFAULT_AXIS_TEXT_INDENT, yCoord);

                context.moveTo(0, yCoord);
                context.lineTo(width, yCoord);
            }
            context.closePath();
            context.stroke();
            yContext.closePath();
            yContext.stroke();
        },

        draw:function () {
            var context = this.canvasContext,
                scaleIndex = this.chart.scaleIndex,
                options = this.options,
                textSettings = options.textSettings,
                colorSettings = this.chart.colorSchemeController.colorScheme();

            this.renderer.render(context, scaleIndex, textSettings, colorSettings, options.symbolName);
        },

        moveCursor:function () {
            var position = this.currentCursorPosition,
                placeholderPositions = this.placeholderController.placeholderPositionsArray,
                barFocusedByCursor = placeholderPositions[placeholderPositions.binarySearch(position.x, comparator)],
                options = this.options,
                quoteIndexes = options.quoteIndexes,
                cursorX, price,
                quotes = this.chart.quotesController.getQuotes(),
                $yValueBadge = this.$yValueBadge,
                yValueBadge = Utils.getPriceOfCurrentCursorPosition(this.canvasTopPointValue, position.y, this.priceUnitInPixel);

            $yValueBadge.text(yValueBadge.toFixed(options.axisSettings.decimalsOnAxis)).removeClass('hidden').css({
                'top':position.y - $yValueBadge.outerHeight() / 2
            });

            if (barFocusedByCursor) {
                cursorX = Math.floor(barFocusedByCursor.middle);
                price = quotes[barFocusedByCursor.index];
            } else {
                cursorX = Math.floor(position.x);
            }

            this.eventBus.fire('mouseMoved', {
                position:{
                    x:cursorX + 0.5,
                    y:Math.floor(position.y) + 0.5
                },
                price:!price ? null : {
                    open:price[quoteIndexes.open],
                    high:price[quoteIndexes.high],
                    low:price[quoteIndexes.low],
                    close:price[quoteIndexes.close],
                    timestamp:price[quoteIndexes.timestamp]
                }
            });
        }
    };

    $.fn.stockChart = function (options, data) {
        return this.each(function () {
            var $this = $(this),
                chart = $this.data('stock-chart');

            if (!chart) {
                $this.data('stock-chart', (chart = new StockChart(this, options, data)));
            }
            if (typeof options == 'string') {
                switch (options) {
                    case 'setData':
                        chart.setData(data);
                        break;
                    case 'zoomIn':
                        chart.zoomIn();
                        break;
                    case 'zoomOut':
                        chart.zoomOut();
                        break;
                    case 'zoomTo':
                        chart.zoomTo(data);
                        break;
                    case 'updateQuote':
                        chart.updateQuote(data);
                        break;
                    case 'addQuote':
                        chart.addQuote(data);
                        break;
                    case 'scheme':
                        chart.changeScheme(data);
                        break;
                    default :
                        throw 'Unsupported method: ' + options;
                }

            }
        });
    };
})(window, document, jQuery);